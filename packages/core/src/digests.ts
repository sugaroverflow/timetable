import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  effectiveDigestSettings,
  isCalendarEnabled,
  isDigestKindEnabled,
  isHostCommentsEnabled,
  type DigestKind,
  type DigestKinds,
  type EffectiveDigestSettings,
} from "@timetable/shared";

import type { NotificationSettings, TimetableSettings } from "@timetable/db";
import {
  activityEvents,
  commentMentions,
  comments,
  db,
  hearts,
  hostHearts,
  timeslots,
  timetableMemberships,
  timetables,
  topics,
  topicSeen,
  users,
} from "@timetable/db";

import { listUpcomingSessions, type DigestSession } from "./calendar";

export type DigestRecipient = {
  id: string;
  email: string | null;
  name: string | null;
  lastDigestAt: Date | null;
  notificationSettings: NotificationSettings;
};

/** A named member with a stable link target. The email links `userId` to
 * their per-forum profile (the person page redirects id → slug); `image`
 * is the per-forum avatar (null → the initials fallback). Only the topic
 * author's avatar is currently rendered, so comment/heart authors leave
 * `image` null. */
export type DigestPerson = {
  name: string | null;
  userId: string | null;
  image: string | null;
};

/** One comment in a thread. `id`/`parentId` let the email merge several
 * replies into a single tree (shared ancestors shown once). */
export type DigestComment = {
  id: string;
  parentId: string | null;
  author: DigestPerson;
  body: string;
};

/**
 * Digest v3 (2026-07-30): the digest is a list of TOPIC CARDS, not
 * per-kind sections. Each card is one topic ("Author: Title") carrying
 * every piece of news about it — comments, replies, ❤️s, an assignment, a
 * fresh publish, a lingering draft — aggregated and ordered most-actionable
 * first.
 */
export type DigestActivity =
  /** A comment or reply in a thread the recipient cares about (their topic,
   * or a reply to their comment). `ancestors` is the thread above it
   * (root → the new comment's parent) so the email can indent the tree;
   * `replyToCommentId` deep-links the Reply button to this comment. */
  | {
      kind: "comment" | "reply";
      /** Which thread this belongs to — the email labels host-only and
       * you-and-admin threads and keeps each kind in its own tree. */
      visibility: "public" | "host_only" | "admin_only";
      /** The new comment itself; `comment.id` is the Reply deep-link target. */
      comment: DigestComment;
      /** Thread above it (root → its parent), for merging into one tree. */
      ancestors: DigestComment[];
      at: Date;
    }
  /** ❤️s on the recipient's topic — every hearter named (no cap). */
  | { kind: "heart"; hearters: DigestPerson[]; at: Date }
  /** 💙s from fellow hosts on the recipient's topic (host hearts,
   * 2026-08-04). Only in forums with the host-only thread enabled — with
   * it off a 💙 is never shown to its recipient, and the email must not
   * leak what the UI deliberately hides. */
  | { kind: "hostHeart"; hearters: DigestPerson[]; at: Date }
  /** An upcoming CONFIRMED session for a topic the recipient ❤️'d
   * (QA 2026-08-03): rides the topic's card in every digest until it
   * happens; only `session.isNew` (confirmed since the last digest) can
   * make an otherwise-quiet digest send. */
  | { kind: "session"; session: DigestSessionLine; at: Date }
  /** A topic newly published in a forum where the recipient is an elector
   * or (round 2) a host. */
  | { kind: "new"; at: Date }
  /** A topic awaiting review by the recipient (an admin) — round 2. The
   * WHOLE review queue rides every digest (a standing to-do, like draft
   * reminders); only `isNew` (submitted/updated since the window) counts
   * as send-triggering news. */
  | { kind: "pending"; at: Date; isNew: boolean }
  /** A topic an admin (re)assigned to the recipient. */
  | { kind: "assignment"; at: Date }
  /** The recipient's own still-unpublished draft — a standing reminder. */
  | { kind: "draft"; at: Date };

/** A session line in the digest's calendar sections. `isNew` marks
 * confirmed/proposed changes since the last digest, so a weekly email reads
 * as news, not a repeated wall of the same listings. */
export type DigestSessionLine = DigestSession & { isNew: boolean };

export type DigestTopicCard = {
  topicId: string;
  title: string;
  /** The topic's host — the card head shows their avatar + "by {author}". */
  author: DigestPerson;
  /** The topic's markdown body — shown (truncated) on status cards
   * (assigned / newly published / draft) so the reader sees what it is. */
  body: string | null;
  /** The topic's permalink; the email builds per-comment reply links on it. */
  path: string | null;
  activities: DigestActivity[];
};

/**
 * One digest email per (user, forum). A member of three forums gets up to
 * three emails, each branded as its forum, each holding only that forum's
 * topic cards.
 */
export type ForumDigest = {
  userId: string;
  email: string;
  name: string | null;
  forumId: string;
  forumName: string;
  forumSlug: string;
  /** The forum theme's primary colour — the email's link/accent colour.
   * Null falls back to the app default. */
  accent: string | null;
  /** The forum's own role labels, for the host-only / you-and-admin thread
   * headings (defaults "Host" / "Admin"). */
  hostLabel: string;
  adminLabel: string;
  topics: DigestTopicCard[];
  /** "Can you make it?": upcoming PROPOSED sessions for topics this
   * recipient ❤️'d — the moment they're motivated to upgrade a 🟡.
   * (Confirmed sessions ride their topic's card instead — QA 2026-08-03.) */
  availabilityAsks: DigestSessionLine[];
  /** New dates released (round 2, host switch): timeslots created since
   * the window — e.g. a hall week — for hosts hunting for a slot. */
  newSlots: DigestSlotRelease[];
  /** Members who signed in for the first time since the window (round 2,
   * admin switch). */
  newMembers: DigestPerson[];
};

/** One released timeslot in the "New dates" section. */
export type DigestSlotRelease = {
  startsAt: Date;
  endsAt: Date;
  locations: string[];
  timetableId: string;
};

function topicPath(
  timetableSlug: string | null | undefined,
  hostSlug: string | null | undefined,
  topicSlug: string | null | undefined,
): string | null {
  if (!timetableSlug || !hostSlug || !topicSlug) return null;
  return `/f/${timetableSlug}/${hostSlug}/${topicSlug}`;
}

/** Everyone with an email — whether any of their forums' digests are due
 * and enabled is a PER-MEMBERSHIP question (2026-08-11), answered inside
 * computeUserForumDigests. */
export async function listDigestRecipients(): Promise<DigestRecipient[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      lastDigestAt: users.lastDigestAt,
      notificationSettings: users.notificationSettings,
    })
    .from(users);

  return rows.filter((u) => u.email);
}

/** Whether a forum's digest should go out on `now`'s (UTC) day: daily
 * always; weekly only on the chosen weekday. */
export function isDigestDue(
  settings: EffectiveDigestSettings,
  now: Date,
): boolean {
  if (settings.frequency === "daily") return true;
  return now.getUTCDay() === settings.weekday;
}

/** First-digest lookback when there's no lastDigestAt watermark. */
export function digestWindowDays(settings: EffectiveDigestSettings): number {
  return settings.frequency === "weekly" ? 7 : 1;
}

/** Advance the per-forum send watermarks (2026-08-11) — every DUE forum,
 * sent or empty, so a quiet window never re-accumulates. */
export async function markForumDigestsSent(
  userId: string,
  timetableIds: string[],
  when: Date,
): Promise<void> {
  if (timetableIds.length === 0) return;
  await db
    .update(timetableMemberships)
    .set({ lastDigestAt: when })
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        inArray(timetableMemberships.timetableId, timetableIds),
      ),
    );
}

/** Everything the per-forum builders need, loaded once. */
type DigestContext = {
  recipient: DigestRecipient;
  forumIds: string[];
  forumName: Map<string, string>;
  forumSlug: Map<string, string>;
  /** The forum theme's primary colour, for email branding. */
  accent: Map<string, string | null>;
  /** Per-forum role labels (host/admin) for thread headings. */
  hostLabel: Map<string, string>;
  adminLabel: Map<string, string>;
  /** Per-forum "seen it in the app" watermarks: feed visits cover ambient
   * ❤️ counts; notifications-page visits cover comments/replies. New topics
   * use topic_seen rows instead (deliberate queue reviews). */
  seenFeedAt: Map<string, Date | null>;
  seenNotificationsAt: Map<string, Date | null>;
  electorTimetableIds: string[];
  /** Forums where the recipient holds the host role (round 2: host
   * variants of the new-topic and follow kinds, slot releases). */
  hostTimetableIds: string[];
  /** Forums where the recipient is an admin (round 2: new members). */
  adminTimetableIds: string[];
  /** Forums with the calendar feature switched on (calendar v2). */
  calendarTimetableIds: string[];
  /** Forums with the host-only thread on — the only ones whose 💙s may
   * appear in digests (same visibility rule as the thread's 💙 row). */
  hostCommentsTimetableIds: string[];
  /** Per-forum effective digest settings (2026-08-11): on/off, cadence,
   * kinds — membership values over the user's stored globals. */
  effectiveByForum: Map<string, EffectiveDigestSettings>;
  /** The forum's configured per-kind defaults (Forum Settings) — the
   * layer between a member's switches and the global all-on defaults. */
  kindDefaultsByForum: Map<string, DigestKinds>;
  /** Per-forum digest window start (2026-08-11): the membership's own
   * lastDigestAt, then the user's legacy watermark, then the cadence
   * lookback. Collectors prefilter on the earliest and cut per forum. */
  sinceByForum: Map<string, Date>;
  /** The earliest per-forum window start — the SQL prefilter bound. */
  minSince: Date;
};

/** The later of the digest window start and an in-app seen watermark. */
function afterSeen(since: Date, seen: Date | null | undefined): Date {
  return seen && seen > since ? seen : since;
}

/** This forum's window start (minSince when the forum is unknown). */
function sinceFor(ctx: DigestContext, timetableId: string): Date {
  return ctx.sinceByForum.get(timetableId) ?? ctx.minSince;
}

/**
 * Whether this membership may be emailed about its forum. Admins pre-create
 * accounts ("Add person") and populate them before the person knows the
 * forum exists — until the invite email goes out (`inviteSentAt`) or the
 * member opens the forum themselves (either seen-watermark), digest emails
 * would be the forum's surprise first contact. Organic members (creators,
 * invite-link claimants) always pass: visiting the app sets a watermark.
 */
function membershipIsEmailable(m: {
  inviteSentAt: Date | null;
  lastSeenFeedAt: Date | null;
  lastSeenNotificationsAt: Date | null;
}): boolean {
  return Boolean(
    m.inviteSentAt ?? m.lastSeenFeedAt ?? m.lastSeenNotificationsAt,
  );
}

async function loadDigestContext(
  recipient: DigestRecipient,
  now: Date,
): Promise<DigestContext> {
  const rows = await db
    .select({
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
      inviteSentAt: timetableMemberships.inviteSentAt,
      lastSeenFeedAt: timetableMemberships.lastSeenFeedAt,
      lastSeenNotificationsAt: timetableMemberships.lastSeenNotificationsAt,
      digestSettings: timetableMemberships.digestSettings,
      lastDigestAt: timetableMemberships.lastDigestAt,
      name: timetables.name,
      slug: timetables.slug,
      settings: timetables.settings,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

  // Per-forum digests (2026-08-11): a forum is in this run only when its
  // membership's effective settings say enabled AND due today.
  const dayMs = 24 * 60 * 60 * 1000;
  const withEffective = rows.filter(membershipIsEmailable).map((m) => ({
    ...m,
    effective: effectiveDigestSettings(
      m.digestSettings,
      recipient.notificationSettings,
    ),
  }));
  const memberships = withEffective.filter(
    (m) => m.effective.enabled && isDigestDue(m.effective, now),
  );
  const sinceByForum = new Map(
    memberships.map((m) => [
      m.timetableId,
      m.lastDigestAt ??
        recipient.lastDigestAt ??
        new Date(now.getTime() - digestWindowDays(m.effective) * dayMs),
    ]),
  );

  return {
    recipient,
    forumIds: memberships.map((m) => m.timetableId),
    forumName: new Map(memberships.map((m) => [m.timetableId, m.name])),
    forumSlug: new Map(memberships.map((m) => [m.timetableId, m.slug])),
    accent: new Map(
      memberships.map((m) => [
        m.timetableId,
        (m.settings as TimetableSettings | null)?.theme?.primary ?? null,
      ]),
    ),
    hostLabel: new Map(
      memberships.map((m) => [
        m.timetableId,
        (m.settings as TimetableSettings | null)?.roleLabels?.host ?? "Host",
      ]),
    ),
    adminLabel: new Map(
      memberships.map((m) => [
        m.timetableId,
        (m.settings as TimetableSettings | null)?.roleLabels?.admin ?? "Admin",
      ]),
    ),
    seenFeedAt: new Map(
      memberships.map((m) => [m.timetableId, m.lastSeenFeedAt]),
    ),
    seenNotificationsAt: new Map(
      memberships.map((m) => [m.timetableId, m.lastSeenNotificationsAt]),
    ),
    electorTimetableIds: memberships
      .filter((m) => m.roles.includes("elector"))
      .map((m) => m.timetableId),
    hostTimetableIds: memberships
      .filter((m) => m.roles.includes("host") || m.roles.includes("admin"))
      .map((m) => m.timetableId),
    adminTimetableIds: memberships
      .filter((m) => m.roles.includes("admin") || m.roles.includes("owner"))
      .map((m) => m.timetableId),
    calendarTimetableIds: memberships
      .filter((m) =>
        isCalendarEnabled((m.settings as TimetableSettings | null) ?? {}),
      )
      .map((m) => m.timetableId),
    hostCommentsTimetableIds: memberships
      .filter((m) =>
        isHostCommentsEnabled((m.settings as TimetableSettings | null) ?? {}),
      )
      .map((m) => m.timetableId),
    effectiveByForum: new Map(
      memberships.map((m) => [m.timetableId, m.effective]),
    ),
    kindDefaultsByForum: new Map(
      memberships.map((m) => [
        m.timetableId,
        (m.settings as TimetableSettings | null)?.digestKindDefaults ?? {},
      ]),
    ),
    sinceByForum,
    minSince: new Date(
      Math.min(now.getTime(), ...[...sinceByForum.values()].map(Number)),
    ),
  };
}

// ---------------------------------------------------------------------------
// Calendar sections (calendar v2)
// ---------------------------------------------------------------------------

/** How far ahead the digest looks for sessions. */
const SESSION_HORIZON_DAYS = 14;

/** An upcoming session plus HOW the recipient qualifies for it: their ❤️
 * (elector follow) and/or their 💙 (host follow, round 2) — the two ride
 * different per-forum switches. */
type QualifiedSessionLine = DigestSessionLine & {
  viaHeart: boolean;
  viaHostHeart: boolean;
};

/** Upcoming confirmed sessions ("Coming up"), proposed sessions ("Can
 * you make it?"), and — round 2, NOT switchable — sessions on the
 * recipient's OWN topics: an admin scheduling your topic is an admin
 * override you always hear about. Follow scopes: ❤️ (QA 2026-08-03) or
 * 💙 (round 2, confirmed sessions only; asks are an availability
 * question, which is elector business), across the recipient's
 * calendar-enabled forums. `isNew` = session changed since the forum's
 * window start; only fresh sessions can trigger an email by
 * themselves. */
async function loadSessionSections(
  ctx: DigestContext,
  now: Date,
  myTopicIds: Set<string>,
): Promise<{
  upcoming: QualifiedSessionLine[];
  asks: DigestSessionLine[];
  /** Proposed AND confirmed sessions on the recipient's own topics. */
  own: DigestSessionLine[];
}> {
  if (ctx.calendarTimetableIds.length === 0) {
    return { upcoming: [], asks: [], own: [] };
  }
  const horizon = {
    from: now,
    to: new Date(now.getTime() + SESSION_HORIZON_DAYS * 24 * 60 * 60 * 1000),
  };
  const [confirmed, proposed] = await Promise.all([
    listUpcomingSessions(ctx.calendarTimetableIds, "confirmed", horizon),
    listUpcomingSessions(ctx.calendarTimetableIds, "proposed", horizon),
  ]);

  const allTopicIds = [...confirmed, ...proposed].map((s) => s.topicId);
  if (allTopicIds.length === 0) return { upcoming: [], asks: [], own: [] };
  const [heartRows, hostHeartRows] = await Promise.all([
    db
      .select({ topicId: hearts.topicId })
      .from(hearts)
      .where(
        and(
          eq(hearts.userId, ctx.recipient.id),
          inArray(hearts.topicId, allTopicIds),
        ),
      ),
    db
      .select({ topicId: hostHearts.topicId })
      .from(hostHearts)
      .where(
        and(
          eq(hostHearts.userId, ctx.recipient.id),
          inArray(hostHearts.topicId, allTopicIds),
        ),
      ),
  ]);
  const heartedTopicIds = new Set(heartRows.map((r) => r.topicId));
  const hostHeartedTopicIds = new Set(hostHeartRows.map((r) => r.topicId));
  const heartedLine = (s: DigestSession) => ({
    ...s,
    isNew: s.updatedAt > sinceFor(ctx, s.timetableId),
  });

  return {
    upcoming: confirmed
      .filter(
        (s) =>
          !myTopicIds.has(s.topicId) &&
          (heartedTopicIds.has(s.topicId) ||
            hostHeartedTopicIds.has(s.topicId)),
      )
      .map((s) => ({
        ...heartedLine(s),
        viaHeart: heartedTopicIds.has(s.topicId),
        viaHostHeart: hostHeartedTopicIds.has(s.topicId),
      })),
    asks: proposed
      .filter(
        (s) => !myTopicIds.has(s.topicId) && heartedTopicIds.has(s.topicId),
      )
      .map(heartedLine),
    own: [...confirmed, ...proposed]
      .filter((s) => myTopicIds.has(s.topicId))
      .map(heartedLine),
  };
}

/** One raw activity tagged with its topic + forum, before cards are built.
 * `switch` names the per-forum setting that gates it when the activity
 * kind alone is ambiguous (round 2: a "comment" may be governed by
 * comments, commentsHearted, or commentsHostHearted). */
type RawActivity = {
  topicId: string;
  timetableId: string;
  activity: DigestActivity;
  switch?: DigestKind;
};

/** Topic display fields resolved once for every referenced topic. */
type TopicMeta = {
  timetableId: string;
  title: string;
  author: DigestPerson;
  body: string | null;
  path: string | null;
};

/** Resolve title, author (host), and permalink for every referenced topic
 * in one query — the topic's own host membership supplies the author name,
 * link target, and the slug the permalink needs. */
async function resolveTopicMeta(
  ctx: DigestContext,
  topicIds: string[],
): Promise<Map<string, TopicMeta>> {
  const meta = new Map<string, TopicMeta>();
  if (topicIds.length === 0) return meta;
  const rows = await db
    .select({
      id: topics.id,
      title: topics.title,
      body: topics.bodyMd,
      timetableId: topics.timetableId,
      topicSlug: topics.slug,
      hostId: topics.hostId,
      hostName: timetableMemberships.name,
      hostSlug: timetableMemberships.slug,
      hostImage: timetableMemberships.image,
    })
    .from(topics)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, topics.hostId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(inArray(topics.id, topicIds));
  for (const r of rows) {
    meta.set(r.id, {
      timetableId: r.timetableId,
      title: r.title,
      body: r.body,
      author: { name: r.hostName, userId: r.hostId, image: r.hostImage },
      path: topicPath(
        ctx.forumSlug.get(r.timetableId),
        r.hostSlug,
        r.topicSlug,
      ),
    });
  }
  return meta;
}

type ThreadRow = {
  id: string;
  parentId: string | null;
  timetableId: string;
};

type AncestorNode = {
  parentId: string | null;
  body: string;
  author: DigestPerson;
};

/** Load every ancestor comment above the seed ids, breadth-first up the
 * parentId links (threads are shallow). Author names resolve in the
 * comment's own forum via the join, so cross-forum digests stay correct. */
async function loadAncestorComments(
  seeds: string[],
): Promise<Map<string, AncestorNode>> {
  const loaded = new Map<string, AncestorNode>();
  let frontier = [...new Set(seeds)];
  while (frontier.length > 0) {
    const rows = await db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        body: comments.body,
        deletedAt: comments.deletedAt,
        authorId: comments.authorId,
        authorName: timetableMemberships.name,
      })
      .from(comments)
      .innerJoin(topics, eq(topics.id, comments.topicId))
      .leftJoin(
        timetableMemberships,
        and(
          eq(timetableMemberships.userId, comments.authorId),
          eq(timetableMemberships.timetableId, topics.timetableId),
        ),
      )
      .where(inArray(comments.id, frontier));
    const next: string[] = [];
    for (const row of rows) {
      loaded.set(row.id, {
        parentId: row.parentId,
        body: row.deletedAt ? "[comment removed]" : row.body,
        author: { name: row.authorName, userId: row.authorId, image: null },
      });
      if (row.parentId && !loaded.has(row.parentId)) next.push(row.parentId);
    }
    frontier = next;
  }
  return loaded;
}

/** Walk one comment's parent links into a root→(its parent) ordered chain. */
function chainFor(
  parentId: string | null,
  loaded: Map<string, AncestorNode>,
): DigestComment[] {
  const chain: DigestComment[] = [];
  let cursor = parentId;
  while (cursor) {
    const node = loaded.get(cursor);
    if (!node) break;
    chain.push({
      id: cursor,
      parentId: node.parentId,
      author: node.author,
      body: node.body,
    });
    cursor = node.parentId;
  }
  return chain.reverse();
}

/** For each thread row, the ancestor chain root → its parent comment. */
async function loadAncestorChains(
  rows: ThreadRow[],
): Promise<Map<string, DigestComment[]>> {
  const seeds = rows
    .map((r) => r.parentId)
    .filter((id): id is string => id != null);
  if (seeds.length === 0) return new Map(rows.map((r) => [r.id, []]));
  const loaded = await loadAncestorComments(seeds);
  return new Map(rows.map((r) => [r.id, chainFor(r.parentId, loaded)]));
}

/** Comments on the recipient's topics (public + their admin thread). */
async function commentActivities(
  ctx: DigestContext,
  since: Date,
  myTopicIds: string[],
  timetableByTopic: Map<string, string>,
): Promise<RawActivity[]> {
  if (myTopicIds.length === 0) return [];
  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      topicId: comments.topicId,
      authorId: comments.authorId,
      visibility: comments.visibility,
      by: timetableMemberships.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(comments.topicId, myTopicIds),
        gt(comments.createdAt, since),
        // The topic owner is party to all three threads on their own topic
        // (public, {host}-only, and the {admin} drafting thread).
        inArray(comments.visibility, ["public", "host_only", "admin_only"]),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );
  const fresh = rows.filter((r) => {
    const timetableId = timetableByTopic.get(r.topicId) ?? "";
    return (
      r.createdAt >
      afterSeen(
        sinceFor(ctx, timetableId),
        ctx.seenNotificationsAt.get(timetableId),
      )
    );
  });
  const chains = await loadAncestorChains(
    fresh.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      timetableId: timetableByTopic.get(r.topicId) ?? "",
    })),
  );
  return fresh.map((r) => ({
    topicId: r.topicId,
    timetableId: timetableByTopic.get(r.topicId) ?? "",
    // Every thread on your topics — public, {host}-only, and the
    // you-and-admin drafting thread — rides the one `comments` switch
    // (Ed folded the separate drafting switch back in, 2026-08-11).
    switch: "comments" as const,
    activity: {
      kind: "comment" as const,
      visibility: r.visibility,
      comment: {
        id: r.id,
        parentId: r.parentId,
        author: { name: r.by, userId: r.authorId, image: null },
        body: r.body,
      },
      ancestors: chains.get(r.id) ?? [],
      at: r.createdAt,
    },
  }));
}

/** The comment ids whose NEW children are thread activity for this user
 * (dialogue-first threading, 2026-08-13): their own comments (someone
 * replied to them / continued their chain — chains attach every message
 * to the chain's first comment) plus the parents of their comments (a
 * chain they joined moved on). */
async function loadChainScope(userId: string): Promise<Set<string>> {
  const mine = await db
    .select({ id: comments.id, parentId: comments.parentId })
    .from(comments)
    .where(eq(comments.authorId, userId));
  const scope = new Set<string>();
  for (const c of mine) {
    scope.add(c.id);
    if (c.parentId) scope.add(c.parentId);
  }
  return scope;
}

/** New comments in chains the recipient is part of — replies to their
 * comments and continuations of dialogues they joined ({@link
 * loadChainScope}). The email batches a chain's messages into one thread
 * block (shared ancestors merge), so several new messages read as one
 * "your thread moved" notification. */
async function replyActivities(
  ctx: DigestContext,
  since: Date,
  chainScope: Set<string>,
): Promise<RawActivity[]> {
  const chainIds = [...chainScope];
  if (chainIds.length === 0) return [];

  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      topicId: comments.topicId,
      timetableId: topics.timetableId,
      authorId: comments.authorId,
      visibility: comments.visibility,
      by: timetableMemberships.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(comments.parentId, chainIds),
        gt(comments.createdAt, since),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );

  // Replies live on the Notifications page — a visit there after the reply
  // means it was seen in the app; don't email it.
  const fresh = rows.filter(
    (r) =>
      r.createdAt >
      afterSeen(
        sinceFor(ctx, r.timetableId),
        ctx.seenNotificationsAt.get(r.timetableId),
      ),
  );
  const chains = await loadAncestorChains(fresh);

  return fresh.map((r) => ({
    topicId: r.topicId,
    timetableId: r.timetableId,
    activity: {
      kind: "reply" as const,
      visibility: r.visibility,
      comment: {
        id: r.id,
        parentId: r.parentId,
        author: { name: r.by, userId: r.authorId, image: null },
        body: r.body,
      },
      ancestors: chains.get(r.id) ?? [],
      at: r.createdAt,
    },
  }));
}

/** ❤️s on the recipient's topics since the feed watermark — every hearter
 * named and linked. */
async function heartActivities(
  ctx: DigestContext,
  since: Date,
  myTopicIds: string[],
  timetableByTopic: Map<string, string>,
): Promise<RawActivity[]> {
  if (myTopicIds.length === 0) return [];
  const rows = await db
    .select({
      topicId: hearts.topicId,
      createdAt: hearts.createdAt,
      userId: hearts.userId,
      hearter: timetableMemberships.name,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, hearts.userId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(inArray(hearts.topicId, myTopicIds), gt(hearts.createdAt, since)),
    );

  const byTopic = new Map<
    string,
    { hearters: DigestPerson[]; at: Date; timetableId: string }
  >();
  for (const row of rows) {
    const timetableId = timetableByTopic.get(row.topicId) ?? "";
    const cutoff = afterSeen(
      sinceFor(ctx, timetableId),
      ctx.seenFeedAt.get(timetableId),
    );
    if (row.createdAt <= cutoff) continue;
    const entry = byTopic.get(row.topicId) ?? {
      hearters: [],
      at: row.createdAt,
      timetableId,
    };
    entry.hearters.push({
      name: row.hearter,
      userId: row.userId,
      image: null,
    });
    if (row.createdAt > entry.at) entry.at = row.createdAt;
    byTopic.set(row.topicId, entry);
  }
  return [...byTopic.entries()].map(([topicId, e]) => ({
    topicId,
    timetableId: e.timetableId,
    activity: { kind: "heart" as const, hearters: e.hearters, at: e.at },
  }));
}

/** 💙s from fellow hosts on the recipient's topics — same shape and feed
 * watermark as ❤️s, restricted to forums whose host-only thread is on
 * (elsewhere a 💙 is recipient-invisible by design). */
async function hostHeartActivities(
  ctx: DigestContext,
  since: Date,
  myTopicIds: string[],
  timetableByTopic: Map<string, string>,
): Promise<RawActivity[]> {
  if (myTopicIds.length === 0 || ctx.hostCommentsTimetableIds.length === 0) {
    return [];
  }
  const enabled = new Set(ctx.hostCommentsTimetableIds);
  const rows = await db
    .select({
      topicId: hostHearts.topicId,
      createdAt: hostHearts.createdAt,
      userId: hostHearts.userId,
      hearter: timetableMemberships.name,
    })
    .from(hostHearts)
    .innerJoin(topics, eq(topics.id, hostHearts.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, hostHearts.userId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(hostHearts.topicId, myTopicIds),
        gt(hostHearts.createdAt, since),
      ),
    );

  const byTopic = new Map<
    string,
    { hearters: DigestPerson[]; at: Date; timetableId: string }
  >();
  for (const row of rows) {
    const timetableId = timetableByTopic.get(row.topicId) ?? "";
    if (!enabled.has(timetableId)) continue;
    const cutoff = afterSeen(
      sinceFor(ctx, timetableId),
      ctx.seenFeedAt.get(timetableId),
    );
    if (row.createdAt <= cutoff) continue;
    const entry = byTopic.get(row.topicId) ?? {
      hearters: [],
      at: row.createdAt,
      timetableId,
    };
    entry.hearters.push({
      name: row.hearter,
      userId: row.userId,
      image: null,
    });
    if (row.createdAt > entry.at) entry.at = row.createdAt;
    byTopic.set(row.topicId, entry);
  }
  return [...byTopic.entries()].map(([topicId, e]) => ({
    topicId,
    timetableId: e.timetableId,
    activity: { kind: "hostHeart" as const, hearters: e.hearters, at: e.at },
  }));
}

/** Comments on topics the recipient follows with a ❤️ (elector) or 💙
 * (host) — round 2 of the digest kinds (2026-08-11). The public thread
 * for ❤️ follows; 💙 follows also carry the host-only thread where that
 * feature is on. The recipient's own topics (the `comments` kind), their
 * own comments, and replies to them (the `replies` kind) are excluded, so
 * nothing lands twice. Ambient discussion, so the FEED watermark covers
 * it, like ❤️s. */
async function followedCommentActivities(
  ctx: DigestContext,
  since: Date,
  follow: "heart" | "hostHeart",
  chainScope: Set<string>,
): Promise<RawActivity[]> {
  const followTable = follow === "heart" ? hearts : hostHearts;
  const followed = await db
    .select({ topicId: followTable.topicId, timetableId: topics.timetableId })
    .from(followTable)
    .innerJoin(topics, eq(topics.id, followTable.topicId))
    .where(
      and(
        eq(followTable.userId, ctx.recipient.id),
        inArray(topics.timetableId, ctx.forumIds),
        ne(topics.hostId, ctx.recipient.id),
      ),
    );
  if (followed.length === 0) return [];
  const timetableByTopic = new Map(
    followed.map((f) => [f.topicId, f.timetableId]),
  );

  const hostThreadOn = new Set(ctx.hostCommentsTimetableIds);
  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      topicId: comments.topicId,
      authorId: comments.authorId,
      visibility: comments.visibility,
      by: timetableMemberships.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(
          comments.topicId,
          followed.map((f) => f.topicId),
        ),
        gt(comments.createdAt, since),
        inArray(
          comments.visibility,
          follow === "hostHeart" ? ["public", "host_only"] : ["public"],
        ),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );

  const fresh = rows.filter((r) => {
    const timetableId = timetableByTopic.get(r.topicId) ?? "";
    if (r.visibility === "host_only" && !hostThreadOn.has(timetableId)) {
      return false;
    }
    // Chains the recipient is in already ride the `replies` kind.
    if (r.parentId && chainScope.has(r.parentId)) return false;
    return (
      r.createdAt >
      afterSeen(sinceFor(ctx, timetableId), ctx.seenFeedAt.get(timetableId))
    );
  });
  const chains = await loadAncestorChains(
    fresh.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      timetableId: timetableByTopic.get(r.topicId) ?? "",
    })),
  );
  return fresh.map((r) => ({
    topicId: r.topicId,
    timetableId: timetableByTopic.get(r.topicId) ?? "",
    switch:
      follow === "heart"
        ? ("commentsHearted" as const)
        : ("commentsHostHearted" as const),
    activity: {
      kind: "comment" as const,
      visibility: r.visibility,
      comment: {
        id: r.id,
        parentId: r.parentId,
        author: { name: r.by, userId: r.authorId, image: null },
        body: r.body,
      },
      ancestors: chains.get(r.id) ?? [],
      at: r.createdAt,
    },
  }));
}

/** Comments that @mention the recipient (round 2) — anywhere they were
 * mentioned, excluding what other kinds already carry: their own topics
 * (comments) and replies to them (replies). Mention rows
 * are only written for users allowed to see the thread, so no extra
 * visibility filtering is needed. The Notifications page shows mentions,
 * so its watermark covers them. */
async function mentionActivities(
  ctx: DigestContext,
  since: Date,
  chainScope: Set<string>,
): Promise<RawActivity[]> {
  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      topicId: comments.topicId,
      timetableId: topics.timetableId,
      topicHostId: topics.hostId,
      authorId: comments.authorId,
      visibility: comments.visibility,
      by: timetableMemberships.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(commentMentions)
    .innerJoin(comments, eq(comments.id, commentMentions.commentId))
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        eq(commentMentions.userId, ctx.recipient.id),
        inArray(topics.timetableId, ctx.forumIds),
        gt(comments.createdAt, since),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );

  const fresh = rows.filter(
    (r) =>
      // Own-topic comments and your chains' messages are their own kinds.
      r.topicHostId !== ctx.recipient.id &&
      !(r.parentId && chainScope.has(r.parentId)) &&
      r.createdAt >
        afterSeen(
          sinceFor(ctx, r.timetableId),
          ctx.seenNotificationsAt.get(r.timetableId),
        ),
  );
  const chains = await loadAncestorChains(fresh);
  return fresh.map((r) => ({
    topicId: r.topicId,
    timetableId: r.timetableId,
    switch: "mentions" as const,
    activity: {
      kind: "comment" as const,
      visibility: r.visibility,
      comment: {
        id: r.id,
        parentId: r.parentId,
        author: { name: r.by, userId: r.authorId, image: null },
        body: r.body,
      },
      ancestors: chains.get(r.id) ?? [],
      at: r.createdAt,
    },
  }));
}

/** The recipient's ENTIRE review queue (round 2, admin switch, Ed:
 * admins toggle a standing "for review" listing): every topic currently
 * awaiting review in their admin forums, never their own. `updatedAt`
 * approximates the submission time (status transitions bump it; a later
 * edit re-flagging a queued topic as news is a feature) — only
 * since-window items count as send-triggering news. */
async function pendingReviewActivities(
  ctx: DigestContext,
): Promise<RawActivity[]> {
  const eligible = ctx.adminTimetableIds.filter((id) =>
    isDigestKindEnabled(
      ctx.effectiveByForum.get(id)?.kinds,
      "pendingReview",
      ctx.kindDefaultsByForum.get(id),
    ),
  );
  if (eligible.length === 0) return [];
  const rows = await db
    .select({
      id: topics.id,
      timetableId: topics.timetableId,
      updatedAt: topics.updatedAt,
    })
    .from(topics)
    .where(
      and(
        inArray(topics.timetableId, eligible),
        eq(topics.status, "submitted"),
        ne(topics.hostId, ctx.recipient.id),
      ),
    );
  return rows.map((r) => ({
    topicId: r.id,
    timetableId: r.timetableId,
    switch: "pendingReview" as const,
    activity: {
      kind: "pending" as const,
      at: r.updatedAt,
      isNew: r.updatedAt > sinceFor(ctx, r.timetableId),
    },
  }));
}

/** Timeslots released since the window (round 2, host switch) — new
 * dates hosts can claim, e.g. a hall week. Future slots only. */
async function loadSlotReleases(
  ctx: DigestContext,
  now: Date,
): Promise<DigestSlotRelease[]> {
  const eligible = ctx.hostTimetableIds.filter(
    (id) =>
      ctx.calendarTimetableIds.includes(id) &&
      isDigestKindEnabled(
        ctx.effectiveByForum.get(id)?.kinds,
        "slotReleases",
        ctx.kindDefaultsByForum.get(id),
      ),
  );
  if (eligible.length === 0) return [];
  const rows = await db
    .select({
      startsAt: timeslots.startsAt,
      endsAt: timeslots.endsAt,
      locations: timeslots.locations,
      timetableId: timeslots.timetableId,
      createdAt: timeslots.createdAt,
    })
    .from(timeslots)
    .where(
      and(
        inArray(timeslots.timetableId, eligible),
        gt(timeslots.createdAt, ctx.minSince),
        gt(timeslots.startsAt, now),
      ),
    )
    .orderBy(asc(timeslots.startsAt));
  return rows
    .filter((r) => r.createdAt > sinceFor(ctx, r.timetableId))
    .map((r) => ({
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      locations: r.locations,
      timetableId: r.timetableId,
    }));
}

/** Members who signed in for the first time since the window (round 2,
 * admin switch), named via their membership profile. */
async function loadNewMembers(
  ctx: DigestContext,
): Promise<(DigestPerson & { timetableId: string })[]> {
  const eligible = ctx.adminTimetableIds.filter((id) =>
    isDigestKindEnabled(
      ctx.effectiveByForum.get(id)?.kinds,
      "newMembers",
      ctx.kindDefaultsByForum.get(id),
    ),
  );
  if (eligible.length === 0) return [];
  const rows = await db
    .select({
      userId: activityEvents.actorId,
      timetableId: activityEvents.timetableId,
      createdAt: activityEvents.createdAt,
      name: timetableMemberships.name,
    })
    .from(activityEvents)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, activityEvents.actorId),
        eq(timetableMemberships.timetableId, activityEvents.timetableId),
      ),
    )
    .where(
      and(
        eq(activityEvents.action, "member.first_login"),
        inArray(activityEvents.timetableId, eligible),
        gt(activityEvents.createdAt, ctx.minSince),
        ne(activityEvents.actorId, ctx.recipient.id),
      ),
    )
    .orderBy(asc(activityEvents.createdAt));
  return rows
    .filter((r) => r.userId && r.createdAt > sinceFor(ctx, r.timetableId))
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      image: null,
      timetableId: r.timetableId,
    }));
}

/** Topics newly published in forums where the recipient is an elector
 * (their queue-review work) or — round 2 — a host (faculty awareness of
 * colleagues' topics), still unseen and never their own. Each row rides
 * whichever switch its roles allow. */
async function newTopicActivities(
  ctx: DigestContext,
  since: Date,
): Promise<RawActivity[]> {
  const electorSet = new Set(ctx.electorTimetableIds);
  const hostSet = new Set(ctx.hostTimetableIds);
  const eligible = [...new Set([...electorSet, ...hostSet])];
  if (eligible.length === 0) return [];
  const rows = await db
    .select({
      id: topics.id,
      timetableId: topics.timetableId,
      publishedAt: topics.publishedAt,
    })
    .from(topics)
    .where(
      and(
        inArray(topics.timetableId, eligible),
        eq(topics.status, "published"),
        gt(topics.publishedAt, since),
        ne(topics.hostId, ctx.recipient.id),
      ),
    );
  if (rows.length === 0) return [];

  // "Seen" for a new topic means deliberately reviewed — a topic_seen row
  // (queue Next or hearting), never a superficial feed scroll.
  const seenRows = await db
    .select({ topicId: topicSeen.topicId })
    .from(topicSeen)
    .where(
      and(
        eq(topicSeen.userId, ctx.recipient.id),
        inArray(
          topicSeen.topicId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const seen = new Set(seenRows.map((r) => r.topicId));

  // A dual-role member gets the card when EITHER applicable switch is on,
  // so the passing switch resolves here against the forum's settings; the
  // post-filter then re-checks the same switch (a no-op by construction).
  const passingSwitch = (timetableId: string): DigestKind | null => {
    const kinds = ctx.effectiveByForum.get(timetableId)?.kinds;
    const defaults = ctx.kindDefaultsByForum.get(timetableId);
    if (
      electorSet.has(timetableId) &&
      isDigestKindEnabled(kinds, "newTopics", defaults)
    ) {
      return "newTopics";
    }
    if (
      hostSet.has(timetableId) &&
      isDigestKindEnabled(kinds, "newTopicsHost", defaults)
    ) {
      return "newTopicsHost";
    }
    return null;
  };

  return rows
    .filter(
      (r) =>
        !seen.has(r.id) &&
        (r.publishedAt ?? since) > sinceFor(ctx, r.timetableId),
    )
    .flatMap((r) => {
      const via = passingSwitch(r.timetableId);
      if (!via) return [];
      return [
        {
          topicId: r.id,
          timetableId: r.timetableId,
          switch: via,
          activity: { kind: "new" as const, at: r.publishedAt ?? since },
        },
      ];
    });
}

/** Topics an admin (re)assigned to the recipient. */
async function assignmentActivities(
  ctx: DigestContext,
  since: Date,
): Promise<RawActivity[]> {
  const rows = await db
    .select({
      payload: activityEvents.payload,
      timetableId: activityEvents.timetableId,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.action, "topic.reassign"),
        gt(activityEvents.createdAt, since),
        sql`${activityEvents.payload}->>'newHostId' = ${ctx.recipient.id}`,
      ),
    );
  return rows
    .map((r) => {
      const payload = r.payload as { topicId?: string } | null;
      return { topicId: payload?.topicId, r };
    })
    .filter(
      (x): x is { topicId: string; r: (typeof rows)[number] } =>
        Boolean(x.topicId) && x.r.createdAt > sinceFor(ctx, x.r.timetableId),
    )
    .map(({ topicId, r }) => ({
      topicId,
      timetableId: r.timetableId,
      activity: { kind: "assignment" as const, at: r.createdAt },
    }));
}

/** Which per-forum switch governs each activity kind. */
/** The fallback switch per activity kind for activities without an
 * explicit `switch` tag. PARTIAL (round 2): sessions and assignments are
 * absent — an untagged session (your own topic scheduled) or an
 * assignment is an admin override that always sends; collectors tag
 * everything else that needs a specific switch. */
const KIND_SWITCH: Partial<Record<DigestActivity["kind"], DigestKind>> = {
  comment: "comments",
  reply: "replies",
  heart: "hearts",
  hostHeart: "hostHearts",
  new: "newTopics",
  pending: "pendingReview",
  draft: "drafts",
};

/** Ranks — the coarse one groups cards (your content first, drafts last),
 * the fine one orders activities within a single card. */
const CARD_TIER: Record<DigestActivity["kind"], number> = {
  session: 0,
  reply: 0,
  comment: 0,
  heart: 0,
  hostHeart: 0,
  assignment: 1,
  pending: 1,
  new: 2,
  draft: 3,
};
const ACTIVITY_RANK: Record<DigestActivity["kind"], number> = {
  session: 0,
  reply: 1,
  comment: 2,
  heart: 3,
  hostHeart: 4,
  assignment: 5,
  pending: 6,
  new: 7,
  draft: 8,
};

function cardTier(card: DigestTopicCard): number {
  return Math.min(...card.activities.map((a) => CARD_TIER[a.kind]));
}
function cardRecency(card: DigestTopicCard): number {
  return Math.max(...card.activities.map((a) => a.at.getTime()));
}

/** One run's output: the non-empty digests plus every forum whose window
 * was due (sent or quiet) — the caller advances those watermarks. */
export type UserDigestRun = {
  digests: ForumDigest[];
  dueForumIds: string[];
};

type WantsIn = (forumId: string, kind: DigestKind) => boolean;

/** Fan out the activity collectors, skipping any kind no forum wants. */
async function collectActivities(
  ctx: DigestContext,
  since: Date,
  wantsIn: WantsIn,
  myTopicIds: string[],
  timetableByTopic: Map<string, string>,
): Promise<RawActivity[]> {
  const wants = (kind: DigestKind) =>
    ctx.forumIds.some((id) => wantsIn(id, kind));
  const none: RawActivity[] = [];
  // Which comments count as "the recipient's chains" — shared by the
  // replies kind (inclusion) and the followed/mention kinds (exclusion).
  const chainScope = await loadChainScope(ctx.recipient.id);
  const collected = await Promise.all([
    wants("comments")
      ? commentActivities(ctx, since, myTopicIds, timetableByTopic)
      : none,
    wants("commentsHearted")
      ? followedCommentActivities(ctx, since, "heart", chainScope)
      : none,
    wants("commentsHostHearted")
      ? followedCommentActivities(ctx, since, "hostHeart", chainScope)
      : none,
    wants("replies") ? replyActivities(ctx, since, chainScope) : none,
    wants("mentions") ? mentionActivities(ctx, since, chainScope) : none,
    wants("hearts")
      ? heartActivities(ctx, since, myTopicIds, timetableByTopic)
      : none,
    wants("hostHearts")
      ? hostHeartActivities(ctx, since, myTopicIds, timetableByTopic)
      : none,
    wants("newTopics") || wants("newTopicsHost")
      ? newTopicActivities(ctx, since)
      : none,
    pendingReviewActivities(ctx),
    // Assignments are an admin override — never switchable, always sent.
    assignmentActivities(ctx, since),
  ]);
  return collected.flat();
}

/** Confirmed sessions ride their topic's card (QA 2026-08-03) — present
 * in every digest a follower receives until the session happens. Each
 * line rides whichever follow switch (❤️/💙) qualifies it. */
function sessionActivities(
  upcoming: QualifiedSessionLine[],
  wantsIn: WantsIn,
): RawActivity[] {
  return upcoming.flatMap((s) => {
    const via =
      s.viaHeart && wantsIn(s.timetableId, "sessions")
        ? ("sessions" as const)
        : s.viaHostHeart && wantsIn(s.timetableId, "sessionsHostHearted")
          ? ("sessionsHostHearted" as const)
          : null;
    if (!via) return [];
    const { viaHeart: _h, viaHostHeart: _hh, ...line } = s;
    return [
      {
        topicId: s.topicId,
        timetableId: s.timetableId,
        switch: via,
        activity: { kind: "session" as const, session: line, at: s.updatedAt },
      },
    ];
  });
}

/**
 * Digest v3 (2026-07-30): one digest PER FORUM, built as topic cards.
 * Every activity is grouped under its topic, cards ordered your-content
 * first (replies/comments/❤️s) → assignments → new topics, drafts last.
 * Forums with no non-draft news yield no digest. Fully per-forum
 * (2026-08-11): enabled, cadence, window, and kind switches all resolve
 * from the membership (user globals as fallback) — only due forums are
 * computed at all.
 */
export async function computeUserForumDigests(
  recipient: DigestRecipient,
  now: Date = new Date(),
): Promise<UserDigestRun> {
  const ctx = await loadDigestContext(recipient, now);
  if (ctx.forumIds.length === 0) return { digests: [], dueForumIds: [] };
  const since = ctx.minSince;
  // Per-FORUM kind switches, from the membership: a kind is only
  // collected if some forum wants it, and each activity then filters
  // against its own forum's switches — absent keys keep the defaults.
  const wantsIn: WantsIn = (forumId, kind) =>
    isDigestKindEnabled(
      ctx.effectiveByForum.get(forumId)?.kinds,
      kind,
      ctx.kindDefaultsByForum.get(forumId),
    );
  const wants = (kind: DigestKind) =>
    ctx.forumIds.some((id) => wantsIn(id, kind));

  const myTopics = await db
    .select({
      id: topics.id,
      status: topics.status,
      timetableId: topics.timetableId,
    })
    .from(topics)
    .where(eq(topics.hostId, recipient.id));
  const myTopicIds = myTopics.map((t) => t.id);
  const timetableByTopic = new Map(myTopics.map((t) => [t.id, t.timetableId]));

  const [sessions, collectedA, newSlots, newMembers] = await Promise.all([
    loadSessionSections(ctx, now, new Set(myTopicIds)),
    collectActivities(ctx, since, wantsIn, myTopicIds, timetableByTopic),
    loadSlotReleases(ctx, now),
    loadNewMembers(ctx),
  ]);

  // Sessions on the recipient's OWN topics: an admin override — no
  // switch, always in (the missing `switch` tag passes the post-filter).
  const ownSessionsA: RawActivity[] = sessions.own.map((s) => ({
    topicId: s.topicId,
    timetableId: s.timetableId,
    activity: { kind: "session" as const, session: s, at: s.updatedAt },
  }));

  const draftsA: RawActivity[] = wants("drafts")
    ? myTopics
        .filter((t) => t.status === "unpublished")
        .map((t) => ({
          topicId: t.id,
          timetableId: t.timetableId,
          activity: { kind: "draft" as const, at: new Date(0) },
        }))
    : [];

  // A comment can qualify through several kinds at once (❤️ + 💙 follow,
  // or an @mention on a followed topic) — the first collector wins.
  const FOLLOW_SWITCHES: (DigestKind | undefined)[] = [
    "commentsHearted",
    "commentsHostHearted",
    "mentions",
  ];
  const seenFollowedComment = new Set<string>();
  const all = [
    ...ownSessionsA,
    ...sessionActivities(sessions.upcoming, wantsIn),
    ...collectedA,
    ...draftsA,
  ]
    .filter((a) => {
      // No governing switch (own-topic sessions, assignments): always in.
      const sw = a.switch ?? KIND_SWITCH[a.activity.kind];
      return !sw || wantsIn(a.timetableId, sw);
    })
    .filter((a) => {
      if (
        a.activity.kind !== "comment" ||
        !FOLLOW_SWITCHES.includes(a.switch)
      ) {
        return true;
      }
      if (seenFollowedComment.has(a.activity.comment.id)) return false;
      seenFollowedComment.add(a.activity.comment.id);
      return true;
    });
  const meta = await resolveTopicMeta(ctx, [
    ...new Set(all.map((a) => a.topicId)),
  ]);

  const digests = ctx.forumIds.map((forumId): ForumDigest => {
    const cards = buildCards(
      all.filter((a) => a.timetableId === forumId),
      meta,
    );
    return {
      userId: recipient.id,
      email: recipient.email ?? "",
      name: recipient.name,
      forumId,
      forumName: ctx.forumName.get(forumId) ?? "",
      forumSlug: ctx.forumSlug.get(forumId) ?? "",
      accent: ctx.accent.get(forumId) ?? null,
      hostLabel: ctx.hostLabel.get(forumId) ?? "Host",
      adminLabel: ctx.adminLabel.get(forumId) ?? "Admin",
      topics: cards,
      availabilityAsks: wantsIn(forumId, "availabilityAsks")
        ? sessions.asks.filter((s) => s.timetableId === forumId)
        : [],
      newSlots: newSlots.filter((s) => s.timetableId === forumId),
      newMembers: newMembers
        .filter((m) => m.timetableId === forumId)
        .map(({ timetableId: _t, ...person }) => person),
    };
  });

  return {
    digests: digests.filter((d) => !isForumDigestEmpty(d)),
    dueForumIds: ctx.forumIds,
  };
}

/** Group raw activities into ordered topic cards. */
function buildCards(
  raws: RawActivity[],
  meta: Map<string, TopicMeta>,
): DigestTopicCard[] {
  const byTopic = new Map<string, DigestActivity[]>();
  for (const raw of raws) {
    const list = byTopic.get(raw.topicId) ?? [];
    list.push(raw.activity);
    byTopic.set(raw.topicId, list);
  }

  const cards: DigestTopicCard[] = [];
  for (const [topicId, activities] of byTopic) {
    const m = meta.get(topicId);
    activities.sort(
      (a, b) =>
        ACTIVITY_RANK[a.kind] - ACTIVITY_RANK[b.kind] ||
        b.at.getTime() - a.at.getTime(),
    );
    cards.push({
      topicId,
      title: m?.title ?? "A topic",
      author: m?.author ?? { name: null, userId: null, image: null },
      body: m?.body ?? null,
      path: m?.path ?? null,
      activities,
    });
  }

  // Cards: your-content tier first, then by recency within a tier.
  cards.sort(
    (a, b) => cardTier(a) - cardTier(b) || cardRecency(b) - cardRecency(a),
  );
  return cards;
}

/** Whether one activity justifies sending an email. Drafts never do;
 * a standing (not-new) session listing never does either — it appears in
 * every digest that sends, but only a session confirmed since the last
 * digest is itself news (QA 2026-08-03). */
function activityIsNews(a: DigestActivity): boolean {
  if (a.kind === "draft") return false;
  if (a.kind === "session") return a.session.isNew;
  // The standing review queue only sends for fresh submissions.
  if (a.kind === "pending") return a.isNew;
  return true;
}

/** Empty = nothing that counts as news. Slot releases and new members are
 * since-window events, so their presence is inherently news. */
export function isForumDigestEmpty(digest: ForumDigest): boolean {
  const topicNews = digest.topics.some((card) =>
    card.activities.some(activityIsNews),
  );
  const askNews = digest.availabilityAsks.some((s) => s.isNew);
  return (
    !topicNews &&
    !askNews &&
    digest.newSlots.length === 0 &&
    digest.newMembers.length === 0
  );
}
