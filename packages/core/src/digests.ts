import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import { isDigestEnabled } from "@timetable/shared";

import type { NotificationSettings, TimetableSettings } from "@timetable/db";
import {
  activityEvents,
  comments,
  db,
  hearts,
  timetableMemberships,
  timetables,
  topics,
  topicSeen,
  users,
} from "@timetable/db";

export type DigestRecipient = {
  id: string;
  email: string | null;
  name: string | null;
  lastDigestAt: Date | null;
  notificationSettings: NotificationSettings;
};

/**
 * Digest v3 (2026-07-30): the digest is a list of TOPIC CARDS, not
 * per-kind sections. Each card is one topic ("Author: Title") carrying
 * every piece of news about it — comments, replies, ❤️s, an assignment, a
 * fresh publish, a lingering draft — aggregated together and ordered so
 * the most actionable cards come first.
 */
export type DigestActivity =
  /** A comment on the recipient's topic. `replyToCommentId` deep-links the
   * email's Reply button to that comment's composer. */
  | {
      kind: "comment";
      by: string | null;
      body: string;
      replyToCommentId: string;
      at: Date;
    }
  /** A reply to one of the recipient's comments, with the full ancestor
   * chain (topic root → the recipient's comment) for context. */
  | {
      kind: "reply";
      by: string | null;
      body: string;
      ancestors: { by: string | null; body: string }[];
      replyToCommentId: string;
      at: Date;
    }
  /** ❤️s on the recipient's topic since they last looked — every hearter
   * named (Ed: no cap, the individuals matter). */
  | { kind: "heart"; hearters: string[]; at: Date }
  /** A topic newly published in a forum where the recipient is an elector. */
  | { kind: "new"; at: Date }
  /** A topic an admin (re)assigned to the recipient. */
  | { kind: "assignment"; at: Date }
  /** The recipient's own still-unpublished draft — a standing reminder,
   * never the sole reason for an email. */
  | { kind: "draft"; at: Date };

export type DigestTopicCard = {
  topicId: string;
  title: string;
  /** The topic's host — rendered "Author: Title" like the Analysis table. */
  author: string | null;
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
  topics: DigestTopicCard[];
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
  /** Per-forum "seen it in the app" watermarks: feed visits cover ambient
   * ❤️ counts; notifications-page visits cover comments/replies. New topics
   * use topic_seen rows instead (deliberate queue reviews). */
  seenFeedAt: Map<string, Date | null>;
  seenNotificationsAt: Map<string, Date | null>;
  electorTimetableIds: string[];
};

/** The later of the digest window start and an in-app seen watermark. */
function afterSeen(since: Date, seen: Date | null | undefined): Date {
  return seen && seen > since ? seen : since;
}

async function loadDigestContext(
  recipient: DigestRecipient,
): Promise<DigestContext> {
  const memberships = await db
    .select({
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
      lastSeenFeedAt: timetableMemberships.lastSeenFeedAt,
      lastSeenNotificationsAt: timetableMemberships.lastSeenNotificationsAt,
      name: timetables.name,
      slug: timetables.slug,
      settings: timetables.settings,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

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
    seenFeedAt: new Map(
      memberships.map((m) => [m.timetableId, m.lastSeenFeedAt]),
    ),
    seenNotificationsAt: new Map(
      memberships.map((m) => [m.timetableId, m.lastSeenNotificationsAt]),
    ),
    electorTimetableIds: memberships
      .filter((m) => m.roles.includes("elector"))
      .map((m) => m.timetableId),
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
  author: string | null;
  path: string | null;
};

/** Resolve title, author (host), and permalink for every referenced topic
 * in one query — the topic's own host membership supplies both the author
 * name and the slug the permalink needs. */
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
      timetableId: topics.timetableId,
      topicSlug: topics.slug,
      hostName: timetableMemberships.name,
      hostSlug: timetableMemberships.slug,
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
      author: r.hostName,
      path: topicPath(
        ctx.forumSlug.get(r.timetableId),
        r.hostSlug,
        r.topicSlug,
      ),
    });
  }
  return meta;
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
      topicId: comments.topicId,
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
        // The owner sees public comments and their admin thread; the
        // host-only thread stays out of email.
        inArray(comments.visibility, ["public", "admin_only"]),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );
  return rows
    .filter((r) => {
      const timetableId = timetableByTopic.get(r.topicId) ?? "";
      return (
        r.createdAt > afterSeen(since, ctx.seenNotificationsAt.get(timetableId))
      );
    })
    .map((r) => ({
      topicId: r.topicId,
      timetableId: timetableByTopic.get(r.topicId) ?? "",
      activity: {
        kind: "comment" as const,
        by: r.by,
        body: r.body,
        replyToCommentId: r.id,
        at: r.createdAt,
      },
    }));
}

type AncestorNode = {
  parentId: string | null;
  body: string;
  authorId: string;
};

/** Load every ancestor comment above the seed ids, breadth-first up the
 * parentId links (threads are shallow, so a handful of round-trips). */
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
        authorId: comments.authorId,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .where(inArray(comments.id, frontier));
    const next: string[] = [];
    for (const row of rows) {
      loaded.set(row.id, {
        parentId: row.parentId,
        body: row.deletedAt ? "[comment removed]" : row.body,
        authorId: row.authorId,
      });
      if (row.parentId && !loaded.has(row.parentId)) next.push(row.parentId);
    }
    frontier = next;
  }
  return loaded;
}

/** Walk one reply's parent links into a root→(your comment) ordered chain. */
function chainFor(
  parentId: string | null,
  loaded: Map<string, AncestorNode>,
  names: Map<string, string | null>,
): { by: string | null; body: string }[] {
  const chain: { by: string | null; body: string }[] = [];
  let cursor = parentId;
  while (cursor) {
    const node = loaded.get(cursor);
    if (!node) break;
    chain.push({ by: names.get(node.authorId) ?? null, body: node.body });
    cursor = node.parentId;
  }
  return chain.reverse();
}

/** For each reply, the ancestor chain topic-root → the recipient's comment. */
async function loadAncestorChains(
  replies: { id: string; parentId: string | null; timetableId: string }[],
): Promise<Map<string, { by: string | null; body: string }[]>> {
  const seeds = replies
    .map((r) => r.parentId)
    .filter((id): id is string => id != null);
  if (seeds.length === 0) {
    return new Map(replies.map((r) => [r.id, []]));
  }
  const loaded = await loadAncestorComments(seeds);
  const names = await loadMemberNames(
    [...loaded.values()].map((c) => c.authorId),
    replies[0]?.timetableId,
  );
  return new Map(
    replies.map((r) => [r.id, chainFor(r.parentId, loaded, names)]),
  );
}

/** author → membership name within one forum (ancestor authors). */
async function loadMemberNames(
  authorIds: string[],
  timetableId: string | undefined,
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (authorIds.length === 0 || !timetableId) return map;
  const rows = await db
    .select({
      userId: timetableMemberships.userId,
      name: timetableMemberships.name,
    })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        inArray(timetableMemberships.userId, [...new Set(authorIds)]),
      ),
    );
  for (const r of rows) map.set(r.userId, r.name);
  return map;
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
      by: r.by,
      body: r.body,
      ancestors: chains.get(r.id) ?? [],
      replyToCommentId: r.id,
      at: r.createdAt,
    },
  }));
}

/** ❤️s on the recipient's topics since the feed watermark — every hearter
 * named. */
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
    { hearters: string[]; at: Date; timetableId: string }
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
    entry.hearters.push(row.hearter ?? "Someone");
    if (row.createdAt > entry.at) entry.at = row.createdAt;
    byTopic.set(row.topicId, entry);
  }
  return [...byTopic.entries()].map(([topicId, e]) => ({
    topicId,
    timetableId: e.timetableId,
    activity: {
      kind: "heart" as const,
      hearters: e.hearters,
      at: e.at,
    },
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
      activity: {
        kind: "new" as const,
        at: r.publishedAt ?? since,
      },
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
  reply: 0,
  comment: 0,
  heart: 0,
  assignment: 1,
  new: 2,
  draft: 3,
};
const ACTIVITY_RANK: Record<DigestActivity["kind"], number> = {
  reply: 0,
  comment: 1,
  heart: 2,
  assignment: 3,
  new: 4,
  draft: 5,
};

function cardTier(card: DigestTopicCard): number {
  return Math.min(...card.activities.map((a) => CARD_TIER[a.kind]));
}
function cardRecency(card: DigestTopicCard): number {
  return Math.max(...card.activities.map((a) => a.at.getTime()));
}

/**
 * Digest v3 (2026-07-30): one digest PER FORUM, built as topic cards.
 * Every activity is grouped under its topic, cards are ordered your-content
 * first (replies/comments/❤️s) → assignments → new topics, drafts last.
 * Forums with no non-draft news yield no digest.
 */
export async function computeUserForumDigests(
  recipient: DigestRecipient,
  since: Date,
): Promise<ForumDigest[]> {
  const ctx = await loadDigestContext(recipient);

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

  const [commentsA, repliesA, heartsA, newA, assignedA] = await Promise.all([
    commentActivities(ctx, since, myTopicIds, timetableByTopic),
    replyActivities(ctx, since),
    heartActivities(ctx, since, myTopicIds, timetableByTopic),
    newTopicActivities(ctx, since),
    assignmentActivities(ctx, since),
  ]);

  const draftsA: RawActivity[] = myTopics
    .filter((t) => t.status === "unpublished")
    .map((t) => ({
      topicId: t.id,
      timetableId: t.timetableId,
      activity: { kind: "draft" as const, at: new Date(0) },
    }));

  const all = [
    ...commentsA,
    ...repliesA,
    ...heartsA,
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
      topics: cards,
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
      author: m?.author ?? null,
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

/** Empty = nothing but drafts. A lingering draft alone must never trigger
 * an email. */
export function isForumDigestEmpty(digest: ForumDigest): boolean {
  return !digest.topics.some((card) =>
    card.activities.some((a) => a.kind !== "draft"),
  );
}
