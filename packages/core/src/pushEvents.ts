import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

import {
  activityEvents,
  commentMentions,
  comments,
  commentSeen,
  db,
  heartEvents,
  hearts,
  hostHearts,
  loungeComments,
  loungeMentions,
  pushSubscriptions,
  pushSweepState,
  timeslots,
  timetableMemberships,
  timetables,
  topics,
} from "@timetable/db";
import {
  isHostCommentsEnabled,
  type DigestKind,
  type DigestKinds,
  type MembershipDigestSettings,
  type Privacy,
  type Role,
  type TimetableSettings,
} from "@timetable/shared";

import { givenByActiveMember } from "./activeMember";
import { PUSH_LOCK_NAMESPACE } from "./push";
import {
  decidePushAlerts,
  type PushAlert,
  type PushCandidate,
  type PushCommentVisibility,
  type PushForum,
  type PushMembership,
  type PushMessage,
  type PushRecipientContext,
  type PushTopicRef,
} from "./pushAudience";

/**
 * The push sweep's database half (docs/web-push-plan.md §3.2): claim a time
 * window, read what happened in it ONCE for everybody, turn each event into
 * candidates by the §1 kind map, load the recipients' context, and record
 * what the sends came to. The decisions themselves are `pushAudience.ts`.
 *
 * The readers mirror the digest's and the notifications pane's audiences
 * (`digests.ts`, `notifications.ts`, `loungeDigest.ts`) event-first: the
 * digest asks "what happened to this person?", the sweep asks "who did this
 * event happen to?" — same rules, the other way round. Each says which
 * reader it mirrors.
 *
 * Every Date comparison goes through drizzle's `gt`/`lte` on a column (the
 * Date-params gotcha); the claim's raw SQL passes timestamps as text.
 */

/** Rows are stamped with their transaction's START time, so a transaction
 * that began before `to` can commit after it. Sweeping only up to ten
 * seconds ago lets those become visible first. */
export const PUSH_SWEEP_LAG_SECONDS = 10;

/** After a long gap (first boot, an outage, a pause long ago) the window
 * starts at most this far back: alerts are for now, and the pane and the
 * digest carry the rest. */
export const PUSH_SWEEP_MAX_LOOKBACK_MINUTES = 10;

export type PushWindow = { from: Date; to: Date };

export type PushClaim =
  /** This run owns `(from, to]`. */
  | { status: "claimed"; window: PushWindow }
  /** Another instance holds the sweep lock right now. */
  | { status: "busy" }
  /** Someone moved the cursor between our read and our write. */
  | { status: "raced" }
  /** Nothing new to claim (the clock hasn't moved past the cursor). */
  | { status: "empty" };

type ClaimRow = {
  locked?: unknown;
  swept_until?: string;
  from_at?: string;
  to_at?: string;
};

const truthy = (v: unknown) => v === true || v === "t" || v === "true";

/**
 * Plan §3.2 step 1, in one short transaction:
 * `pg_try_advisory_xact_lock` on the sweep key (false → another instance is
 * sweeping); read `swept_until`; `to = now() - 10 s`; start no earlier than
 * `to - 10 min`; compare-and-set the cursor to `to` (zero rows → someone
 * else claimed it); commit, which releases the lock.
 *
 * The cursor is read as TEXT and compared as text cast back to timestamptz,
 * so the compare-and-set is exact to the microsecond (a JS Date would round
 * the seeded row's microseconds away and never match).
 */
export async function claimPushSweepWindow(): Promise<PushClaim> {
  return db.transaction(async (tx): Promise<PushClaim> => {
    const lock = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${sql.raw(String(PUSH_LOCK_NAMESPACE.sweep))}, 0) as locked`,
    )) as unknown as ClaimRow[];
    if (!truthy(lock[0]?.locked)) return { status: "busy" };

    const read = (await tx.execute(sql`
      with b as (
        select swept_until,
               date_trunc('milliseconds', now() - make_interval(secs => ${PUSH_SWEEP_LAG_SECONDS})) as to_at
        from push_sweep_state where id = 1
      )
      select swept_until::text as swept_until,
             to_char(greatest(swept_until, to_at - make_interval(mins => ${PUSH_SWEEP_MAX_LOOKBACK_MINUTES})) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as from_at,
             to_char(to_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as to_at
      from b
    `)) as unknown as ClaimRow[];
    const row = read[0];
    if (!row?.swept_until || !row.from_at || !row.to_at)
      return { status: "empty" };
    const from = new Date(row.from_at);
    const to = new Date(row.to_at);
    if (!(to > from)) return { status: "empty" };

    const moved = (await tx.execute(sql`
      update push_sweep_state
         set swept_until = ${row.to_at}::timestamptz, updated_at = now()
       where id = 1 and swept_until = ${row.swept_until}::timestamptz
      returning id
    `)) as unknown as unknown[];
    if (moved.length === 0) return { status: "raced" };
    return { status: "claimed", window: { from, to } };
  });
}

/** The cursor, for tests and operators. */
export async function readPushSweepCursor(): Promise<Date | null> {
  const [row] = await db
    .select({ sweptUntil: pushSweepState.sweptUntil })
    .from(pushSweepState)
    .where(eq(pushSweepState.id, 1));
  return row?.sweptUntil ?? null;
}

// ---------------------------------------------------------------------------
// Event readers

function inWindow(column: AnyPgColumn, window: PushWindow) {
  return and(gt(column, window.from), lte(column, window.to));
}

/** Everyone with at least one device — the only people worth reading for
 * (plan §3.2 step 3). */
async function loadSubscriberIds(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);
  return new Set(rows.map((r) => r.userId));
}

/** Candidates accumulate per (person, event), merging the switches they
 * qualify through. */
class CandidateSet {
  private byKey = new Map<string, PushCandidate>();
  constructor(private readonly subscribers: Set<string>) {}

  add(
    userId: string | null | undefined,
    base: Omit<PushCandidate, "userId" | "kinds">,
    kind: DigestKind | null,
  ): void {
    if (!userId || !this.subscribers.has(userId)) return;
    const key = `${userId}\u0000${base.eventKey}`;
    const existing = this.byKey.get(key);
    if (!existing) {
      this.byKey.set(key, { ...base, userId, kinds: kind ? [kind] : null });
      return;
    }
    // A switch-less override wins; otherwise collect the switches.
    if (kind === null) existing.kinds = null;
    else if (existing.kinds && !existing.kinds.includes(kind))
      existing.kinds.push(kind);
  }

  list(): PushCandidate[] {
    return [...this.byKey.values()];
  }
}

const hostMembers = alias(timetableMemberships, "push_host_members");
const actorMembers = alias(timetableMemberships, "push_actor_members");

/** The topic columns every reader needs for a `PushTopicRef`. */
const topicColumns = {
  topicId: topics.id,
  topicTitle: topics.title,
  topicSlug: topics.slug,
  topicHostId: topics.hostId,
  topicStatus: topics.status,
  topicTimetableId: topics.timetableId,
  hostSlug: hostMembers.slug,
  hostName: hostMembers.name,
};

const hostJoin = and(
  eq(hostMembers.userId, topics.hostId),
  eq(hostMembers.timetableId, topics.timetableId),
);

function topicRef(r: {
  topicId: string;
  topicTitle: string;
  topicSlug: string | null;
  topicHostId: string;
  topicStatus: string;
  hostSlug: string | null;
}): PushTopicRef {
  return {
    id: r.topicId,
    title: r.topicTitle,
    slug: r.topicSlug,
    hostId: r.topicHostId,
    hostSlug: r.hostSlug,
    published: r.topicStatus === "published",
  };
}

/** Comment ids → everyone whose chain scope holds them. `loadChainScope`
 * (digests.ts) gives a person their own comments plus the parents of their
 * comments; read the other way, a new child of P is chain news for P's
 * author and for the author of every other child of P. */
async function chainMembers(
  table: typeof comments | typeof loungeComments,
  parentIds: string[],
): Promise<Map<string, Set<string>>> {
  const members = new Map<string, Set<string>>();
  if (parentIds.length === 0) return members;
  const rows = await db
    .select({
      id: table.id,
      parentId: table.parentId,
      authorId: table.authorId,
    })
    .from(table)
    .where(
      or(inArray(table.id, parentIds), inArray(table.parentId, parentIds)),
    );
  const wanted = new Set(parentIds);
  const put = (p: string, a: string) => {
    const set = members.get(p) ?? new Set<string>();
    set.add(a);
    members.set(p, set);
  };
  for (const r of rows) {
    if (wanted.has(r.id)) put(r.id, r.authorId);
    if (r.parentId && wanted.has(r.parentId)) put(r.parentId, r.authorId);
  }
  return members;
}

/** Topic comments (the comments / replies / mentions / commentsHearted /
 * commentsHostHearted rows), mirroring the digest's `commentActivities`,
 * `replyActivities`, `mentionActivities` and `followedCommentActivities`:
 * - the topic's host hears every thread on it (`comments`);
 * - chain members hear new messages in their chains (`replies`);
 * - @mentioned people hear the comment (`mentions`) unless one of the two
 *   above already covers it;
 * - ❤️-ers hear public comments, 💙-ers public and (where that thread is
 *   on) {host}-only ones, again unless their topic or chain covers it.
 * Hidden and deleted comments never alert. */
async function topicCommentCandidates(
  window: PushWindow,
  out: CandidateSet,
): Promise<void> {
  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      authorId: comments.authorId,
      visibility: comments.visibility,
      body: comments.body,
      createdAt: comments.createdAt,
      who: actorMembers.name,
      settings: timetables.settings,
      ...topicColumns,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .innerJoin(timetables, eq(timetables.id, topics.timetableId))
    .leftJoin(hostMembers, hostJoin)
    .leftJoin(
      actorMembers,
      and(
        eq(actorMembers.userId, comments.authorId),
        eq(actorMembers.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inWindow(comments.createdAt, window),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id);
  const topicIds = [...new Set(rows.map((r) => r.topicId))];
  const parentIds = [
    ...new Set(rows.map((r) => r.parentId).filter((p): p is string => !!p)),
  ];
  const [chains, mentions, heartRows, hostHeartRows] = await Promise.all([
    chainMembers(comments, parentIds),
    db
      .select({
        commentId: commentMentions.commentId,
        userId: commentMentions.userId,
      })
      .from(commentMentions)
      .where(inArray(commentMentions.commentId, ids)),
    db
      .select({ topicId: hearts.topicId, userId: hearts.userId })
      .from(hearts)
      .where(inArray(hearts.topicId, topicIds)),
    db
      .select({ topicId: hostHearts.topicId, userId: hostHearts.userId })
      .from(hostHearts)
      .where(inArray(hostHearts.topicId, topicIds)),
  ]);
  const group = <T extends { userId: string }>(
    list: T[],
    key: (t: T) => string,
  ) => {
    const map = new Map<string, string[]>();
    for (const item of list) {
      const k = key(item);
      map.set(k, [...(map.get(k) ?? []), item.userId]);
    }
    return map;
  };
  const mentioned = group(mentions, (m) => m.commentId);
  const hearters = group(heartRows, (h) => h.topicId);
  const hostHearters = group(hostHeartRows, (h) => h.topicId);

  for (const r of rows) {
    const visibility = r.visibility as PushCommentVisibility;
    const base = {
      eventKey: `comment:${r.id}`,
      timetableId: r.topicTimetableId,
      at: r.createdAt,
      actorId: r.authorId,
      message: {
        type: "comment",
        commentId: r.id,
        visibility,
        topic: topicRef(r),
        who: r.who,
        body: r.body,
      } satisfies PushMessage,
    };
    const chain = r.parentId
      ? (chains.get(r.parentId) ?? new Set())
      : new Set();
    const host = r.topicHostId;
    // Covered by the host's own-topic switch or the chain switch.
    const covered = (u: string) => u === host || chain.has(u);

    out.add(host, base, "comments");
    for (const u of chain) out.add(u as string, base, "replies");
    for (const u of mentioned.get(r.id) ?? [])
      if (!covered(u)) out.add(u, base, "mentions");
    if (visibility === "public") {
      for (const u of hearters.get(r.topicId) ?? [])
        if (!covered(u)) out.add(u, base, "commentsHearted");
    }
    const hostThreadOn = isHostCommentsEnabled(
      (r.settings as TimetableSettings | null) ?? {},
    );
    if (
      visibility === "public" ||
      (visibility === "host_only" && hostThreadOn)
    ) {
      for (const u of hostHearters.get(r.topicId) ?? [])
        if (!covered(u)) out.add(u, base, "commentsHostHearted");
    }
  }
}

/** Lounge posts (the lounge row), mirroring `listLoungeNotifications` and
 * the digest card's footprint: a reply to your post, a new message in a
 * chain you're part of, or any post that @mentions you. New conversations
 * are broadcast and don't push — only their @mentions do. A post in a
 * hidden conversation stays hidden with it. */
async function loungeCandidates(
  window: PushWindow,
  out: CandidateSet,
): Promise<void> {
  const roots = alias(loungeComments, "push_lounge_roots");
  const rows = await db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
      rootId: loungeComments.rootId,
      authorId: loungeComments.authorId,
      timetableId: loungeComments.timetableId,
      body: loungeComments.body,
      createdAt: loungeComments.createdAt,
      who: actorMembers.name,
    })
    .from(loungeComments)
    .leftJoin(roots, eq(roots.id, loungeComments.rootId))
    .leftJoin(
      actorMembers,
      and(
        eq(actorMembers.userId, loungeComments.authorId),
        eq(actorMembers.timetableId, loungeComments.timetableId),
      ),
    )
    .where(
      and(
        inWindow(loungeComments.createdAt, window),
        isNull(loungeComments.hiddenAt),
        isNull(loungeComments.deletedAt),
        isNull(roots.hiddenAt),
      ),
    );
  if (rows.length === 0) return;
  const parentIds = [
    ...new Set(rows.map((r) => r.parentId).filter((p): p is string => !!p)),
  ];
  const [chains, mentions] = await Promise.all([
    chainMembers(loungeComments, parentIds),
    db
      .select({
        commentId: loungeMentions.commentId,
        userId: loungeMentions.userId,
      })
      .from(loungeMentions)
      .where(
        inArray(
          loungeMentions.commentId,
          rows.map((r) => r.id),
        ),
      ),
  ]);
  for (const r of rows) {
    const rootId = r.rootId ?? r.id;
    const base = {
      eventKey: `lounge:${r.id}`,
      timetableId: r.timetableId,
      at: r.createdAt,
      actorId: r.authorId,
      message: {
        type: "lounge",
        commentId: r.id,
        rootId,
        isRoot: r.parentId === null,
        who: r.who,
        body: r.body,
      } satisfies PushMessage,
    };
    if (r.parentId) {
      for (const u of chains.get(r.parentId) ?? []) out.add(u, base, "lounge");
    }
    for (const m of mentions)
      if (m.commentId === r.id) out.add(m.userId, base, "lounge");
  }
}

type ActivityPayload = {
  topicId?: string;
  startsAt?: string;
  location?: string;
};

/** Session events on topics people ❤️'d or 💙'd, from the `slot.*` activity
 * log (`listSessionNotifications`): confirm and clear ride `sessions` (❤️)
 * and `sessionsHostHearted` (💙); a pencil asks ❤️-ers "Can you make it?"
 * (`availabilityAsks` — an availability question is elector business, as
 * in the digest). */
async function sessionCandidates(
  window: PushWindow,
  out: CandidateSet,
): Promise<void> {
  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      actorId: activityEvents.actorId,
      payload: activityEvents.payload,
      createdAt: activityEvents.createdAt,
      ...topicColumns,
    })
    .from(activityEvents)
    // payload.topicId is text; topics.id is uuid — compare as text.
    .innerJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .leftJoin(hostMembers, hostJoin)
    .where(
      and(
        inWindow(activityEvents.createdAt, window),
        inArray(activityEvents.action, [
          "slot.confirm",
          "slot.clear",
          "slot.pencil",
        ]),
      ),
    );
  if (rows.length === 0) return;
  const topicIds = [...new Set(rows.map((r) => r.topicId))];
  const [heartRows, hostHeartRows] = await Promise.all([
    db
      .select({ topicId: hearts.topicId, userId: hearts.userId })
      .from(hearts)
      .where(inArray(hearts.topicId, topicIds)),
    db
      .select({ topicId: hostHearts.topicId, userId: hostHearts.userId })
      .from(hostHearts)
      .where(inArray(hostHearts.topicId, topicIds)),
  ]);
  for (const r of rows) {
    const payload = (r.payload ?? {}) as ActivityPayload;
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) continue;
    const action =
      r.action === "slot.confirm"
        ? "confirm"
        : r.action === "slot.clear"
          ? "clear"
          : "pencil";
    const base = {
      eventKey: `activity:${r.id}`,
      timetableId: r.topicTimetableId,
      at: r.createdAt,
      actorId: r.actorId,
      message: {
        type: "session",
        action,
        topic: topicRef(r),
        startsAt,
        location: payload.location ?? null,
      } satisfies PushMessage,
    };
    for (const h of heartRows)
      if (h.topicId === r.topicId)
        out.add(
          h.userId,
          base,
          action === "pencil" ? "availabilityAsks" : "sessions",
        );
    if (action !== "pencil")
      for (const h of hostHeartRows)
        if (h.topicId === r.topicId)
          out.add(h.userId, base, "sessionsHostHearted");
  }
}

/** ❤️s and 💙s given to your topic, from the `heart_events` LEDGER (never
 * the `hearts` table, whose createdAt a cutoff revival bumps), filtered by
 * the active-member-filter. 💙s only where the {host}-only thread is on —
 * elsewhere a 💙 is invisible to its recipient (the digest's rule). */
async function heartCandidates(
  window: PushWindow,
  out: CandidateSet,
): Promise<void> {
  const rows = await db
    .select({
      id: heartEvents.id,
      kind: heartEvents.kind,
      giverId: heartEvents.userId,
      createdAt: heartEvents.createdAt,
      settings: timetables.settings,
      ...topicColumns,
    })
    .from(heartEvents)
    .innerJoin(topics, eq(topics.id, heartEvents.topicId))
    .innerJoin(timetables, eq(timetables.id, heartEvents.timetableId))
    .leftJoin(hostMembers, hostJoin)
    .where(
      and(
        inWindow(heartEvents.createdAt, window),
        eq(heartEvents.action, "add"),
        givenByActiveMember(heartEvents.userId, heartEvents.timetableId),
      ),
    );
  for (const r of rows) {
    const gesture = r.kind === "host_heart" ? "hostHeart" : "heart";
    if (
      gesture === "hostHeart" &&
      !isHostCommentsEnabled((r.settings as TimetableSettings | null) ?? {})
    )
      continue;
    out.add(
      r.topicHostId,
      {
        eventKey: `heart:${r.id}`,
        timetableId: r.topicTimetableId,
        at: r.createdAt,
        actorId: r.giverId,
        message: { type: "heart", gesture, topic: topicRef(r) },
      },
      gesture === "heart" ? "hearts" : "hostHearts",
    );
  }
}

/** Active members of these forums who have a device, with their roles. */
async function subscribedMembers(
  timetableIds: string[],
  subscribers: Set<string>,
): Promise<{ userId: string; timetableId: string; roles: Role[] }[]> {
  if (timetableIds.length === 0 || subscribers.size === 0) return [];
  return db
    .select({
      userId: timetableMemberships.userId,
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
    })
    .from(timetableMemberships)
    .where(
      and(
        inArray(timetableMemberships.timetableId, timetableIds),
        inArray(timetableMemberships.userId, [...subscribers]),
        isNull(timetableMemberships.deactivatedAt),
      ),
    );
}

const isAdminRoles = (roles: readonly string[]) =>
  roles.includes("admin") || roles.includes("owner");
const isHostRoles = (roles: readonly string[]) =>
  roles.includes("host") || roles.includes("admin");

/** The `topic.*` activity events: publish (newTopics / newTopicsHost — the
 * digest's `newTopicActivities`, never your own topic), ready
 * (pendingReview, to admins — the topic must still be a ready draft), and
 * an admin's unready (the switch-less sent-back notice to the host —
 * `unreadyActivities`, skipped once the topic is no longer a draft or when
 * the host flipped it themselves). */
async function topicEventCandidates(
  window: PushWindow,
  out: CandidateSet,
  subscribers: Set<string>,
): Promise<void> {
  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      actorId: activityEvents.actorId,
      createdAt: activityEvents.createdAt,
      readyAt: topics.readyAt,
      who: actorMembers.name,
      ...topicColumns,
    })
    .from(activityEvents)
    .innerJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .leftJoin(hostMembers, hostJoin)
    .leftJoin(
      actorMembers,
      and(
        eq(actorMembers.userId, activityEvents.actorId),
        eq(actorMembers.timetableId, activityEvents.timetableId),
      ),
    )
    .where(
      and(
        inWindow(activityEvents.createdAt, window),
        inArray(activityEvents.action, [
          "topic.publish",
          "topic.ready",
          "topic.unready",
        ]),
      ),
    );
  if (rows.length === 0) return;
  const members = await subscribedMembers(
    [
      ...new Set(
        rows
          .filter((r) => r.action !== "topic.unready")
          .map((r) => r.topicTimetableId),
      ),
    ],
    subscribers,
  );
  for (const r of rows) {
    const topic = topicRef(r);
    const base = {
      eventKey: `activity:${r.id}`,
      timetableId: r.topicTimetableId,
      at: r.createdAt,
      actorId: r.actorId,
    };
    if (r.action === "topic.unready") {
      if (r.topicStatus !== "submitted" || r.actorId === r.topicHostId)
        continue;
      out.add(
        r.topicHostId,
        { ...base, message: { type: "sentBack", who: r.who, topic } },
        null,
      );
      continue;
    }
    const forumMembers = members.filter(
      (m) => m.timetableId === r.topicTimetableId && m.userId !== r.topicHostId,
    );
    if (r.action === "topic.publish") {
      if (!topic.published) continue;
      const message: PushMessage = { type: "newTopic", who: r.hostName, topic };
      for (const m of forumMembers) {
        out.add(m.userId, { ...base, message }, "newTopics");
        out.add(m.userId, { ...base, message }, "newTopicsHost");
      }
    } else {
      if (r.topicStatus !== "submitted" || !r.readyAt) continue;
      const message: PushMessage = { type: "ready", who: r.hostName, topic };
      for (const m of forumMembers)
        if (isAdminRoles(m.roles))
          out.add(m.userId, { ...base, message }, "pendingReview");
    }
  }
}

/** Future slots released in the window, one alert per forum, to hosts and
 * admins (`loadSlotReleases`). The creator is the actor only when one
 * person made them all. */
async function slotReleaseCandidates(
  window: PushWindow,
  out: CandidateSet,
  subscribers: Set<string>,
): Promise<void> {
  const rows = await db
    .select({
      id: timeslots.id,
      timetableId: timeslots.timetableId,
      startsAt: timeslots.startsAt,
      createdById: timeslots.createdById,
      createdAt: timeslots.createdAt,
    })
    .from(timeslots)
    .where(
      and(
        inWindow(timeslots.createdAt, window),
        gt(timeslots.startsAt, window.to),
      ),
    );
  if (rows.length === 0) return;
  const byForum = new Map<string, typeof rows>();
  for (const r of rows)
    byForum.set(r.timetableId, [...(byForum.get(r.timetableId) ?? []), r]);
  const members = await subscribedMembers([...byForum.keys()], subscribers);
  for (const [timetableId, slots] of byForum) {
    const first = slots.reduce((a, b) => (b.startsAt < a.startsAt ? b : a));
    const latest = slots.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const creators = new Set(slots.map((s) => s.createdById));
    const base = {
      eventKey: `slots:${timetableId}:${window.to.toISOString()}`,
      timetableId,
      at: latest.createdAt,
      actorId: creators.size === 1 ? (slots[0]!.createdById ?? null) : null,
      message: {
        type: "slotRelease",
        count: slots.length,
        firstStartsAt: first.startsAt,
      } satisfies PushMessage,
    };
    for (const m of members)
      if (m.timetableId === timetableId && isHostRoles(m.roles))
        out.add(m.userId, base, "slotReleases");
  }
}

/** Members signing in for the first time (`member.first_login`, the
 * digest's `loadNewMembers`), to admins. */
async function newMemberCandidates(
  window: PushWindow,
  out: CandidateSet,
  subscribers: Set<string>,
): Promise<void> {
  const rows = await db
    .select({
      id: activityEvents.id,
      actorId: activityEvents.actorId,
      timetableId: activityEvents.timetableId,
      createdAt: activityEvents.createdAt,
      who: actorMembers.name,
    })
    .from(activityEvents)
    .leftJoin(
      actorMembers,
      and(
        eq(actorMembers.userId, activityEvents.actorId),
        eq(actorMembers.timetableId, activityEvents.timetableId),
      ),
    )
    .where(
      and(
        inWindow(activityEvents.createdAt, window),
        eq(activityEvents.action, "member.first_login"),
        isNotNull(activityEvents.actorId),
      ),
    );
  if (rows.length === 0) return;
  const members = await subscribedMembers(
    [...new Set(rows.map((r) => r.timetableId))],
    subscribers,
  );
  for (const r of rows) {
    const base = {
      eventKey: `activity:${r.id}`,
      timetableId: r.timetableId,
      at: r.createdAt,
      actorId: r.actorId,
      message: { type: "newMember", who: r.who } satisfies PushMessage,
    };
    for (const m of members)
      if (m.timetableId === r.timetableId && isAdminRoles(m.roles))
        out.add(m.userId, base, "newMembers");
  }
}

/** Every candidate in the window (plan §3.2 steps 2–3), only for people
 * with a device. */
export async function loadPushCandidates(
  window: PushWindow,
): Promise<PushCandidate[]> {
  const subscribers = await loadSubscriberIds();
  if (subscribers.size === 0) return [];
  const out = new CandidateSet(subscribers);
  // Sequential: a handful of small range queries, and the sweep should
  // never take more than a couple of the pool's ten connections.
  await topicCommentCandidates(window, out);
  await loungeCandidates(window, out);
  await sessionCandidates(window, out);
  await heartCandidates(window, out);
  await topicEventCandidates(window, out, subscribers);
  await slotReleaseCandidates(window, out, subscribers);
  await newMemberCandidates(window, out, subscribers);
  return out.list();
}

/** The recipients' memberships, forums and comment read marks. */
export async function loadPushRecipientContext(
  candidates: readonly PushCandidate[],
): Promise<PushRecipientContext> {
  const userIds = [...new Set(candidates.map((c) => c.userId))];
  const memberships = new Map<string, PushMembership>();
  const forums = new Map<string, PushForum>();
  const seen = new Map<string, Date>();
  const counts = new Map<string, number>();
  const key = (a: string, b: string) => `${a}\u0000${b}`;

  if (userIds.length > 0) {
    const rows = await db
      .select({
        userId: timetableMemberships.userId,
        timetableId: timetableMemberships.timetableId,
        roles: timetableMemberships.roles,
        deactivatedAt: timetableMemberships.deactivatedAt,
        digestSettings: timetableMemberships.digestSettings,
        loungeSeenAt: timetableMemberships.loungeSeenAt,
        slug: timetables.slug,
        name: timetables.name,
        privacy: timetables.privacy,
        settings: timetables.settings,
      })
      .from(timetableMemberships)
      .innerJoin(
        timetables,
        eq(timetables.id, timetableMemberships.timetableId),
      )
      .where(inArray(timetableMemberships.userId, userIds));
    for (const r of rows) {
      memberships.set(key(r.userId, r.timetableId), {
        roles: r.roles,
        deactivatedAt: r.deactivatedAt,
        push: (r.digestSettings as MembershipDigestSettings | null)?.push as
          | DigestKinds
          | undefined,
        loungeSeenAt: r.loungeSeenAt,
      });
      forums.set(r.timetableId, {
        id: r.timetableId,
        slug: r.slug,
        name: r.name,
        privacy: r.privacy as Privacy,
        settings: (r.settings as TimetableSettings | null) ?? {},
      });
      if (!r.deactivatedAt)
        counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1);
    }

    const topicIds = [
      ...new Set(
        candidates.flatMap((c) =>
          c.message.type === "comment" ? [c.message.topic.id] : [],
        ),
      ),
    ];
    if (topicIds.length > 0) {
      const seenRows = await db
        .select({
          userId: commentSeen.userId,
          topicId: commentSeen.topicId,
          seenAt: commentSeen.seenAt,
        })
        .from(commentSeen)
        .where(
          and(
            inArray(commentSeen.userId, userIds),
            inArray(commentSeen.topicId, topicIds),
          ),
        );
      for (const r of seenRows) seen.set(key(r.userId, r.topicId), r.seenAt);
    }
  }

  return {
    membership: (u, t) => memberships.get(key(u, t)),
    forum: (t) => forums.get(t),
    commentSeenAt: (u, t) => seen.get(key(u, t)),
    forumCount: (u) => counts.get(u) ?? 0,
  };
}

/** Plan §3.2 steps 2–4 for one claimed window: the decided, worded alerts. */
export async function loadPushAlerts(window: PushWindow): Promise<PushAlert[]> {
  const candidates = await loadPushCandidates(window);
  if (candidates.length === 0) return [];
  const ctx = await loadPushRecipientContext(candidates);
  return decidePushAlerts(candidates, ctx);
}

// ---------------------------------------------------------------------------
// Devices and results

/** One device to send to. The endpoint and keys never leave the API. */
export type PushTarget = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
};

export async function listPushTargets(
  userIds: string[],
): Promise<PushTarget[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
}

/** Consecutive failures after which a device is dropped (plan §3.2 step 6). */
export const PUSH_MAX_FAILURES = 20;

export type PushDeliveryResults = {
  /** Accepted: stamp `last_sent_at`, reset `failure_count`. */
  ok: string[];
  /** 404/410: the subscription is dead. Delete. */
  gone: string[];
  /** 429, 5xx, timeout, network, or rejected: one more failure. */
  failed: string[];
};

/**
 * Plan §3.2 step 6, one statement per outcome — the failure outcome is two
 * (drop the rows this failure takes to the limit, then bump the rest), as
 * deleting and updating one row in a single statement is undefined in
 * Postgres. Each statement is autocommitted on its own; nothing is held
 * across sends.
 */
export async function recordPushResults(
  results: PushDeliveryResults,
): Promise<void> {
  const now = new Date();
  if (results.ok.length > 0)
    await db
      .update(pushSubscriptions)
      .set({ lastSentAt: now, failureCount: 0 })
      .where(inArray(pushSubscriptions.id, results.ok));
  if (results.gone.length > 0)
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, results.gone));
  if (results.failed.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          inArray(pushSubscriptions.id, results.failed),
          sql`${pushSubscriptions.failureCount} >= ${PUSH_MAX_FAILURES - 1}`,
        ),
      );
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(inArray(pushSubscriptions.id, results.failed));
  }
}
