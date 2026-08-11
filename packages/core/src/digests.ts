import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  isCalendarEnabled,
  isDigestEnabled,
  isDigestKindEnabled,
  isHostCommentsEnabled,
  type DigestKind,
} from "@timetable/shared";

import type { NotificationSettings, TimetableSettings } from "@timetable/db";
import {
  activityEvents,
  comments,
  db,
  hearts,
  hostHearts,
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
  /** A topic newly published in a forum where the recipient is an elector. */
  | { kind: "new"; at: Date }
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
};

function topicPath(
  timetableSlug: string | null | undefined,
  hostSlug: string | null | undefined,
  topicSlug: string | null | undefined,
): string | null {
  if (!timetableSlug || !hostSlug || !topicSlug) return null;
  return `/f/${timetableSlug}/${hostSlug}/${topicSlug}`;
}

/** Users who have digests switched on and have an email. */
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

  return rows.filter((u) => u.email && isDigestEnabled(u.notificationSettings));
}

/** Whether this recipient's digest should go out on `now`'s (UTC) day:
 * daily always; weekly only on their chosen weekday (default Monday). */
export function isDigestDue(
  settings: NotificationSettings,
  now: Date,
): boolean {
  if ((settings.digestFrequency ?? "daily") === "daily") return true;
  return now.getUTCDay() === (settings.digestWeekday ?? 1);
}

/** First-digest lookback when there's no lastDigestAt watermark. */
export function digestWindowDays(settings: NotificationSettings): number {
  return (settings.digestFrequency ?? "daily") === "weekly" ? 7 : 1;
}

export async function markDigestSent(
  userId: string,
  when: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ lastDigestAt: when })
    .where(eq(users.id, userId));
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
  /** Forums with the calendar feature switched on (calendar v2). */
  calendarTimetableIds: string[];
  /** Forums with the host-only thread on — the only ones whose 💙s may
   * appear in digests (same visibility rule as the thread's 💙 row). */
  hostCommentsTimetableIds: string[];
};

/** The later of the digest window start and an in-app seen watermark. */
function afterSeen(since: Date, seen: Date | null | undefined): Date {
  return seen && seen > since ? seen : since;
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
): Promise<DigestContext> {
  const rows = await db
    .select({
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
      inviteSentAt: timetableMemberships.inviteSentAt,
      lastSeenFeedAt: timetableMemberships.lastSeenFeedAt,
      lastSeenNotificationsAt: timetableMemberships.lastSeenNotificationsAt,
      name: timetables.name,
      slug: timetables.slug,
      settings: timetables.settings,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

  const memberships = rows.filter(membershipIsEmailable);

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
  };
}

// ---------------------------------------------------------------------------
// Calendar sections (calendar v2)
// ---------------------------------------------------------------------------

/** How far ahead the digest looks for sessions. */
const SESSION_HORIZON_DAYS = 14;

/** Upcoming confirmed sessions ("Coming up") and proposed sessions ("Can
 * you make it?"), both scoped to topics the recipient ❤️'d (QA 2026-08-03
 * — a hearter's digest always carries their upcoming confirmed sessions),
 * across the recipient's calendar-enabled forums. `isNew` = session
 * changed since the window start; only fresh sessions can trigger an
 * email by themselves. */
async function loadSessionSections(
  ctx: DigestContext,
  since: Date,
  now: Date,
): Promise<{
  upcoming: DigestSessionLine[];
  asks: DigestSessionLine[];
}> {
  if (ctx.calendarTimetableIds.length === 0) return { upcoming: [], asks: [] };
  const horizon = {
    from: now,
    to: new Date(now.getTime() + SESSION_HORIZON_DAYS * 24 * 60 * 60 * 1000),
  };
  const [confirmed, proposed] = await Promise.all([
    listUpcomingSessions(ctx.calendarTimetableIds, "confirmed", horizon),
    listUpcomingSessions(ctx.calendarTimetableIds, "proposed", horizon),
  ]);

  // Both sections go to the people who ❤️'d the session's topic — the
  // ones the session is for / whose availability the host is waiting on.
  const allTopicIds = [...confirmed, ...proposed].map((s) => s.topicId);
  if (allTopicIds.length === 0) return { upcoming: [], asks: [] };
  const heartRows = await db
    .select({ topicId: hearts.topicId })
    .from(hearts)
    .where(
      and(
        eq(hearts.userId, ctx.recipient.id),
        inArray(hearts.topicId, allTopicIds),
      ),
    );
  const heartedTopicIds = new Set(heartRows.map((r) => r.topicId));
  const heartedLine = (s: DigestSession) => ({
    ...s,
    isNew: s.updatedAt > since,
  });

  return {
    upcoming: confirmed
      .filter((s) => heartedTopicIds.has(s.topicId))
      .map(heartedLine),
    asks: proposed
      .filter((s) => heartedTopicIds.has(s.topicId))
      .map(heartedLine),
  };
}

/** One raw activity tagged with its topic + forum, before cards are built. */
type RawActivity = {
  topicId: string;
  timetableId: string;
  activity: DigestActivity;
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
      r.createdAt > afterSeen(since, ctx.seenNotificationsAt.get(timetableId))
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

/** Replies to the recipient's comments, with ancestor context. */
async function replyActivities(
  ctx: DigestContext,
  since: Date,
): Promise<RawActivity[]> {
  const myComments = await db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.authorId, ctx.recipient.id));
  const myCommentIds = myComments.map((c) => c.id);
  if (myCommentIds.length === 0) return [];

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
        inArray(comments.parentId, myCommentIds),
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
      afterSeen(since, ctx.seenNotificationsAt.get(r.timetableId)),
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
    const cutoff = afterSeen(since, ctx.seenFeedAt.get(timetableId));
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
    const cutoff = afterSeen(since, ctx.seenFeedAt.get(timetableId));
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

/** Topics newly published in the recipient's elector forums, still unseen
 * in the queue. */
async function newTopicActivities(
  ctx: DigestContext,
  since: Date,
): Promise<RawActivity[]> {
  if (ctx.electorTimetableIds.length === 0) return [];
  const rows = await db
    .select({
      id: topics.id,
      timetableId: topics.timetableId,
      publishedAt: topics.publishedAt,
    })
    .from(topics)
    .where(
      and(
        inArray(topics.timetableId, ctx.electorTimetableIds),
        eq(topics.status, "published"),
        gt(topics.publishedAt, since),
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

  return rows
    .filter((r) => !seen.has(r.id))
    .map((r) => ({
      topicId: r.id,
      timetableId: r.timetableId,
      activity: { kind: "new" as const, at: r.publishedAt ?? since },
    }));
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
    .filter((x): x is { topicId: string; r: (typeof rows)[number] } =>
      Boolean(x.topicId),
    )
    .map(({ topicId, r }) => ({
      topicId,
      timetableId: r.timetableId,
      activity: { kind: "assignment" as const, at: r.createdAt },
    }));
}

/** Ranks — the coarse one groups cards (your content first, drafts last),
 * the fine one orders activities within a single card. */
const CARD_TIER: Record<DigestActivity["kind"], number> = {
  session: 0,
  reply: 0,
  comment: 0,
  heart: 0,
  hostHeart: 0,
  assignment: 1,
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
  new: 6,
  draft: 7,
};

function cardTier(card: DigestTopicCard): number {
  return Math.min(...card.activities.map((a) => CARD_TIER[a.kind]));
}
function cardRecency(card: DigestTopicCard): number {
  return Math.max(...card.activities.map((a) => a.at.getTime()));
}

/**
 * Digest v3 (2026-07-30): one digest PER FORUM, built as topic cards.
 * Every activity is grouped under its topic, cards ordered your-content
 * first (replies/comments/❤️s) → assignments → new topics, drafts last.
 * Forums with no non-draft news yield no digest.
 */
export async function computeUserForumDigests(
  recipient: DigestRecipient,
  since: Date,
  now: Date = new Date(),
): Promise<ForumDigest[]> {
  const ctx = await loadDigestContext(recipient);
  // Per-kind switches (2026-08-11): a kind the recipient turned off is
  // never collected — absent keys keep the defaults.
  const wants = (kind: DigestKind) =>
    isDigestKindEnabled(recipient.notificationSettings, kind);
  const sessions = await loadSessionSections(ctx, since, now);

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

  const none: RawActivity[] = [];
  const [commentsA, repliesA, heartsA, hostHeartsA, newA, assignedA] =
    await Promise.all([
      wants("comments")
        ? commentActivities(ctx, since, myTopicIds, timetableByTopic)
        : none,
      wants("replies") ? replyActivities(ctx, since) : none,
      wants("hearts")
        ? heartActivities(ctx, since, myTopicIds, timetableByTopic)
        : none,
      wants("hostHearts")
        ? hostHeartActivities(ctx, since, myTopicIds, timetableByTopic)
        : none,
      wants("newTopics") ? newTopicActivities(ctx, since) : none,
      wants("assignments") ? assignmentActivities(ctx, since) : none,
    ]);

  const draftsA: RawActivity[] = wants("drafts")
    ? myTopics
        .filter((t) => t.status === "unpublished")
        .map((t) => ({
          topicId: t.id,
          timetableId: t.timetableId,
          activity: { kind: "draft" as const, at: new Date(0) },
        }))
    : [];

  // Confirmed sessions ride their topic's card (QA 2026-08-03) — present
  // in every digest a hearter receives until the session happens.
  const sessionsA: RawActivity[] = wants("sessions")
    ? sessions.upcoming.map((s) => ({
        topicId: s.topicId,
        timetableId: s.timetableId,
        activity: { kind: "session" as const, session: s, at: s.updatedAt },
      }))
    : [];

  const all = [
    ...sessionsA,
    ...commentsA,
    ...repliesA,
    ...heartsA,
    ...hostHeartsA,
    ...newA,
    ...assignedA,
    ...draftsA,
  ];
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
      availabilityAsks: wants("availabilityAsks")
        ? sessions.asks.filter((s) => s.timetableId === forumId)
        : [],
    };
  });

  return digests.filter((d) => !isForumDigestEmpty(d));
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
  return true;
}

/** Empty = nothing that counts as news. */
export function isForumDigestEmpty(digest: ForumDigest): boolean {
  const topicNews = digest.topics.some((card) =>
    card.activities.some(activityIsNews),
  );
  const askNews = digest.availabilityAsks.some((s) => s.isNew);
  return !topicNews && !askNews;
}
