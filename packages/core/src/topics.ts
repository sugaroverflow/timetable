import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  comments,
  db,
  hearts,
  timetables,
  topics,
  users,
  type Topic,
  type TopicStatus,
} from "@timetable/db";
import {
  computeElectorHeartCounts,
  computeElectorWeights,
  topicNormScores,
} from "@timetable/shared";

import { logActivity } from "./activity";
import { coerceDate } from "./dates";
import { ensureTopicSlug } from "./slugs";

export async function getTopicById(topicId: string): Promise<Topic | null> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return topic ?? null;
}

/** Permalink resolution: a topic by its per-timetable slug. */
export async function getTopicBySlug(
  timetableId: string,
  slug: string,
): Promise<Topic | null> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.timetableId, timetableId), eq(topics.slug, slug)))
    .limit(1);
  return topic ?? null;
}

export async function createTopic(
  timetableId: string,
  hostId: string,
  input: { title: string; bodyMd?: string; coverImageUrl?: string | null },
): Promise<Topic> {
  const slug = await ensureTopicSlug(timetableId, input.title);
  const [topic] = await db
    .insert(topics)
    .values({
      timetableId,
      hostId,
      title: input.title,
      slug,
      bodyMd: input.bodyMd ?? "",
      coverImageUrl: input.coverImageUrl ?? null,
      // Draft removed (product feedback round 1): new topics are created
      // "submitted" — immediately publishable by an admin.
      status: "submitted",
    })
    .returning();
  if (!topic) throw new Error("Failed to create topic");
  return topic;
}

export async function updateTopic(
  topicId: string,
  input: { title?: string; bodyMd?: string; coverImageUrl?: string | null },
): Promise<Topic | null> {
  // The slug follows title edits until first publish, then freezes so
  // permalinks in digests/links never break.
  let slug: string | undefined;
  if (input.title !== undefined) {
    const current = await getTopicById(topicId);
    if (
      current &&
      current.publishedAt === null &&
      input.title !== current.title
    ) {
      slug = await ensureTopicSlug(current.timetableId, input.title, {
        excludeTopicId: topicId,
      });
    }
  }
  const [updated] = await db
    .update(topics)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.bodyMd !== undefined ? { bodyMd: input.bodyMd } : {}),
      ...(input.coverImageUrl !== undefined
        ? { coverImageUrl: input.coverImageUrl }
        : {}),
      updatedAt: new Date(),
      // Content edits make the topic "new" again (QA #59) — status changes
      // elsewhere never touch this.
      contentUpdatedAt: new Date(),
    })
    .where(eq(topics.id, topicId))
    .returning();
  return updated ?? null;
}

async function setStatus(
  topicId: string,
  status: TopicStatus,
  opts: { publishedAt?: Date | null } = {},
): Promise<Topic | null> {
  const [updated] = await db
    .update(topics)
    .set({
      status,
      ...(opts.publishedAt !== undefined
        ? { publishedAt: opts.publishedAt }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(topics.id, topicId))
    .returning();
  return updated ?? null;
}

/** Admin assigns/reassigns a topic's owner. The topic then shows up in the
 * new owner's My Topics automatically (that view queries by hostId). */
export async function reassignTopic(
  topic: Topic,
  newHostId: string,
  actorId: string,
): Promise<Topic | null> {
  const [updated] = await db
    .update(topics)
    .set({ hostId: newHostId, updatedAt: new Date() })
    .where(eq(topics.id, topic.id))
    .returning();
  await logActivity({
    timetableId: topic.timetableId,
    actorId,
    action: "topic.reassign",
    payload: {
      topicId: topic.id,
      title: topic.title,
      previousHostId: topic.hostId,
      newHostId,
    },
  });
  return updated ?? null;
}

/** Host submits an unpublished topic (re)back into the moderation queue. */
export async function submitTopic(
  topic: Topic,
  actorId: string,
): Promise<Topic | null> {
  const updated = await setStatus(topic.id, "submitted");
  await logActivity({
    timetableId: topic.timetableId,
    actorId,
    action: "topic.submit",
    payload: { topicId: topic.id, title: topic.title },
  });
  return updated;
}

/** Host or admin unpublishes a topic. */
export async function unpublishTopic(
  topic: Topic,
  actorId: string,
): Promise<Topic | null> {
  const updated = await setStatus(topic.id, "unpublished");
  await logActivity({
    timetableId: topic.timetableId,
    actorId,
    action: "topic.unpublish",
    payload: { topicId: topic.id, title: topic.title },
  });
  return updated;
}

/** Moderation actions. request_changes is gone (QA #59 round 3) — admins
 * discuss in the admin-only comment thread and hosts resubmit themselves. */
export type ModerationAction = "publish" | "reject";

/** Admin moderation: publish or reject. */
export async function moderateTopic(
  topic: Topic,
  actorId: string,
  action: ModerationAction,
  note?: string,
): Promise<Topic | null> {
  if (action === "publish") {
    const updated = await setStatus(topic.id, "published", {
      publishedAt: topic.publishedAt ?? new Date(),
    });
    await logActivity({
      timetableId: topic.timetableId,
      actorId,
      action: "topic.publish",
      payload: { topicId: topic.id, title: topic.title },
    });
    return updated;
  }

  const updated = await setStatus(topic.id, "unpublished");
  await logActivity({
    timetableId: topic.timetableId,
    actorId,
    action: "topic.reject",
    payload: { topicId: topic.id, title: topic.title },
    note: note ?? null,
  });
  return updated;
}

/** Topics owned by a single host (all statuses) — host dashboard. */
export async function listHostTopics(
  timetableId: string,
  hostId: string,
): Promise<Topic[]> {
  return db
    .select()
    .from(topics)
    .where(and(eq(topics.timetableId, timetableId), eq(topics.hostId, hostId)))
    .orderBy(desc(topics.updatedAt));
}

/** Submitted topics awaiting moderation — admin queue. */
export async function listSubmittedTopics(
  timetableId: string,
): Promise<Topic[]> {
  return db
    .select()
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "submitted")),
    )
    .orderBy(desc(topics.updatedAt));
}

/** The timetable's heart-count cutoff: hearts created before it are ignored
 * (QA #42 — "archiving" is setting this date). Null = count everything. */
export async function getHeartsCountFrom(
  timetableId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ heartsCountFrom: timetables.heartsCountFrom })
    .from(timetables)
    .where(eq(timetables.id, timetableId))
    .limit(1);
  return row?.heartsCountFrom ?? null;
}

/** Admin: set (or clear) the heart-count cutoff for a timetable. */
export async function setHeartsCountFrom(
  timetableId: string,
  countFrom: Date | null,
  actorId: string,
): Promise<void> {
  await db
    .update(timetables)
    .set({ heartsCountFrom: countFrom, updatedAt: new Date() })
    .where(eq(timetables.id, timetableId));
  await logActivity({
    timetableId,
    actorId,
    action: "hearts.cutoff",
    payload: { countFrom: countFrom ? countFrom.toISOString() : null },
    note: countFrom
      ? `Hearts now count from ${countFrom.toISOString()}`
      : "Hearts cutoff cleared — all hearts count",
  });
}

/** Ids of every published topic in the timetable — weight denominators
 * always span the whole timetable, even for filtered views. */
async function loadPublishedTopicIds(
  timetableId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "published")),
    );
  return new Set(rows.map((r) => r.id));
}

type PublishedHeart = {
  topicId: string;
  electorId: string;
  createdAt: Date;
};

/**
 * All post-cutoff hearts on published topics in the timetable (optionally
 * one user's). The single source for heart-weight inputs — buildFeed,
 * getWeightedBreakdown and countViewerPublishedHearts share its query and
 * cutoff semantics.
 */
async function loadPublishedHearts(
  timetableId: string,
  opts: { userId?: string } = {},
): Promise<PublishedHeart[]> {
  const cutoff = await getHeartsCountFrom(timetableId);
  const conds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published"),
  ];
  if (opts.userId) conds.push(eq(hearts.userId, opts.userId));
  if (cutoff) conds.push(gte(hearts.createdAt, cutoff));
  return db
    .select({
      topicId: hearts.topicId,
      electorId: hearts.userId,
      createdAt: hearts.createdAt,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(and(...conds));
}

/**
 * Number of published topics this user currently hearts (post-cutoff).
 * The user's per-heart vote weight is 1/count — shown to them in the feed.
 */
export async function countViewerPublishedHearts(
  timetableId: string,
  userId: string,
): Promise<number> {
  const viewerHearts = await loadPublishedHearts(timetableId, { userId });
  return viewerHearts.length;
}

/**
 * Feed ranking. The four normalisations (raw/l2/l1/devotion) mirror the
 * dashboard "Analysis" switcher; "hearts" is kept as a backward-compatible
 * alias for "l1" (the original weighted score). See {@link topicNormScores}.
 */
export type FeedSort =
  | "hearts"
  | "raw"
  | "l2"
  | "l1"
  | "devotion"
  | "comments"
  | "recent"
  | "random";

export type FeedTopic = {
  id: string;
  timetableId: string;
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  hostSlug: string | null;
  title: string;
  slug: string | null;
  bodyMd: string;
  coverImageUrl: string | null;
  status: TopicStatus;
  publishedAt: Date | null;
  contentUpdatedAt: Date | null;
  createdAt: Date;
  heartCount: number;
  /** L1 norm (Σ 1/total). Kept named weightedScore for back-compat. */
  weightedScore: number;
  /** L2 norm (Σ 1/√total). */
  l2Score: number;
  /** Average devotion (L1/L∞): weightedScore / heartCount. */
  devotionScore: number;
  viewerHasHearted: boolean;
  commentCount: number;
  latestCommentAt: Date | null;
};

/** Deterministic per-seed rank for random sort — stable within a seed so
 * infinite-scroll pages never repeat or overlap. */
function seededRank(seed: string, id: string): number {
  const s = `${seed}:${id}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

type FeedComparator = (a: FeedTopic, b: FeedTopic) => number;

/** "Newest" counts content edits, not just publication (QA #59). */
function recency(t: FeedTopic): number {
  return Math.max(
    t.publishedAt?.getTime() ?? t.createdAt.getTime(),
    t.contentUpdatedAt?.getTime() ?? 0,
  );
}

/** Normalisation sorts share a stable recency tie-break so equal scores
 * don't jitter between requests. */
function byScore(score: (t: FeedTopic) => number): FeedComparator {
  return (a, b) => {
    const diff = score(b) - score(a);
    return diff !== 0 ? diff : recency(b) - recency(a);
  };
}

const FEED_COMPARATORS: Record<FeedSort, (seed: string) => FeedComparator> = {
  // "hearts" is a legacy alias for "l1" (the original weighted score).
  hearts: () => byScore((t) => t.weightedScore),
  l1: () => byScore((t) => t.weightedScore),
  raw: () => byScore((t) => t.heartCount),
  l2: () => byScore((t) => t.l2Score),
  devotion: () => byScore((t) => t.devotionScore),
  comments: () => (a, b) => {
    const at = a.latestCommentAt?.getTime() ?? 0;
    const bt = b.latestCommentAt?.getTime() ?? 0;
    if (bt !== at) return bt - at;
    return b.commentCount - a.commentCount;
  },
  recent: () => (a, b) => recency(b) - recency(a),
  random: (seed) => (a, b) => seededRank(seed, a.id) - seededRank(seed, b.id),
};

function comparatorFor(sort: FeedSort, seed: string): FeedComparator {
  // Out-of-enum values fall back to the default weighted ranking, matching
  // the old switch's default branch.
  return (FEED_COMPARATORS[sort] ?? FEED_COMPARATORS.hearts)(seed);
}

/** Per-topic elector lists from the flat heart rows. */
function groupHeartsByTopic(
  heartRows: { topicId: string; electorId: string }[],
): Map<string, string[]> {
  const byTopic = new Map<string, string[]>();
  for (const h of heartRows) {
    const list = byTopic.get(h.topicId) ?? [];
    list.push(h.electorId);
    byTopic.set(h.topicId, list);
  }
  return byTopic;
}

/** Displayed topics (optionally filtered to one host/topic) with host
 * profile fields joined in. */
async function loadDisplayedTopicRows(
  timetableId: string,
  opts: { hostId?: string; topicId?: string },
): Promise<
  {
    topic: Topic;
    hostName: string | null;
    hostImage: string | null;
    hostSlug: string | null;
  }[]
> {
  const displayConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published"),
  ];
  if (opts.hostId) displayConds.push(eq(topics.hostId, opts.hostId));
  if (opts.topicId) displayConds.push(eq(topics.id, opts.topicId));

  return db
    .select({
      topic: topics,
      hostName: users.name,
      hostImage: users.image,
      hostSlug: users.slug,
    })
    .from(topics)
    .innerJoin(users, eq(users.id, topics.hostId))
    .where(and(...displayConds));
}

type CommentStat = { count: number; latestCommentAt: Date | null };

/** Public, non-hidden comment counts and latest-comment timestamps. */
async function loadCommentStats(
  topicIds: string[],
): Promise<Map<string, CommentStat>> {
  const commentStats = new Map<string, CommentStat>();
  if (topicIds.length === 0) return commentStats;

  const statRows = await db
    .select({
      topicId: comments.topicId,
      count: sql<number>`count(*)::int`,
      latestCommentAt: sql<Date | null>`max(${comments.createdAt})`,
    })
    .from(comments)
    .where(
      and(
        inArray(comments.topicId, topicIds),
        eq(comments.visibility, "public"),
        isNull(comments.hiddenAt),
      ),
    )
    .groupBy(comments.topicId);
  for (const c of statRows) {
    commentStats.set(c.topicId, {
      count: c.count,
      latestCommentAt: coerceDate(c.latestCommentAt),
    });
  }
  return commentStats;
}

function toFeedTopic(
  row: {
    topic: Topic;
    hostName: string | null;
    hostImage: string | null;
    hostSlug: string | null;
  },
  ctx: {
    heartsByTopic: Map<string, string[]>;
    heartCounts: Map<string, number>;
    commentStats: Map<string, CommentStat>;
    viewerUserId: string | null;
  },
): FeedTopic {
  const { topic, hostName, hostImage, hostSlug } = row;
  const topicHearts = (ctx.heartsByTopic.get(topic.id) ?? []).map(
    (electorId) => ({ topicId: topic.id, electorId }),
  );
  const norms = topicNormScores(topicHearts, ctx.heartCounts);
  return {
    id: topic.id,
    timetableId: topic.timetableId,
    hostId: topic.hostId,
    hostName,
    hostImage,
    hostSlug,
    title: topic.title,
    slug: topic.slug,
    bodyMd: topic.bodyMd,
    coverImageUrl: topic.coverImageUrl,
    status: topic.status,
    publishedAt: topic.publishedAt,
    contentUpdatedAt: topic.contentUpdatedAt,
    createdAt: topic.createdAt,
    heartCount: norms.raw,
    weightedScore: norms.l1,
    l2Score: norms.l2,
    devotionScore: norms.devotion,
    viewerHasHearted: ctx.viewerUserId
      ? topicHearts.some((h) => h.electorId === ctx.viewerUserId)
      : false,
    commentCount: ctx.commentStats.get(topic.id)?.count ?? 0,
    latestCommentAt: ctx.commentStats.get(topic.id)?.latestCommentAt ?? null,
  };
}

function paginate(
  feed: FeedTopic[],
  opts: { limit?: number; offset?: number },
): FeedTopic[] {
  const offset = Math.max(0, opts.offset ?? 0);
  if (opts.limit === undefined) return feed.slice(offset);

  const limit = Math.max(1, Math.min(opts.limit, 50));
  return feed.slice(offset, offset + limit);
}

/**
 * Build the published-topic feed for a timetable.
 *
 * Weights are computed across ALL published topics in the timetable (per the
 * spec), even when the displayed list is filtered to a single host.
 */
export async function buildFeed(
  timetableId: string,
  viewerUserId: string | null,
  opts: {
    hostId?: string;
    topicId?: string;
    /** Only topics the viewer currently hearts (QA #42 "My hearted topics"). */
    heartedByViewer?: boolean;
    sort?: FeedSort;
    /** Shuffle seed for sort=random (QA #59). */
    seed?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<FeedTopic[]> {
  // All published topic ids (for correct weight denominators).
  const publishedIdSet = await loadPublishedTopicIds(timetableId);
  if (publishedIdSet.size === 0) return [];

  const heartRows = await loadPublishedHearts(timetableId);
  const heartCounts = computeElectorHeartCounts(heartRows, publishedIdSet);
  const heartsByTopic = groupHeartsByTopic(heartRows);

  const rows = await loadDisplayedTopicRows(timetableId, opts);
  const commentStats = await loadCommentStats(rows.map((r) => r.topic.id));

  const feed = rows.map((row) =>
    toFeedTopic(row, {
      heartsByTopic,
      heartCounts,
      commentStats,
      viewerUserId,
    }),
  );

  const visibleFeed =
    opts.heartedByViewer && viewerUserId
      ? feed.filter((t) => t.viewerHasHearted)
      : feed;

  visibleFeed.sort(comparatorFor(opts.sort ?? "hearts", opts.seed ?? ""));

  return paginate(visibleFeed, opts);
}

export type WeightedHeartEntry = {
  electorId: string;
  electorName: string | null;
  /** L1 contribution: 1/n where n = the elector's total published hearts. */
  weight: number;
  /** L2 contribution: 1/√n. */
  l2Weight: number;
  /** Share of the topic's devotion score: weight / topic heart count —
   * column-sums to the topic's devotion (L1/L∞) score. */
  devotionWeight: number;
  /** When the elector hearted this topic. */
  heartedAt: Date;
};

/** Host-only per-elector weighted-heart breakdown for one topic. */
export async function getWeightedBreakdown(
  timetableId: string,
  topicId: string,
): Promise<WeightedHeartEntry[]> {
  const publishedIdSet = await loadPublishedTopicIds(timetableId);
  const heartRows = await loadPublishedHearts(timetableId);
  const weights = computeElectorWeights(heartRows, publishedIdSet);
  const heartCounts = computeElectorHeartCounts(heartRows, publishedIdSet);

  const topicHearts = heartRows.filter((h) => h.topicId === topicId);

  if (topicHearts.length === 0) return [];

  const electorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      inArray(
        users.id,
        topicHearts.map((h) => h.electorId),
      ),
    );
  const nameById = new Map(electorRows.map((u) => [u.id, u.name]));

  return topicHearts
    .map((h) => {
      const n = heartCounts.get(h.electorId) ?? 0;
      const weight = weights.get(h.electorId) ?? 0;
      return {
        electorId: h.electorId,
        electorName: nameById.get(h.electorId) ?? null,
        weight,
        l2Weight: n > 0 ? 1 / Math.sqrt(n) : 0,
        devotionWeight: weight / topicHearts.length,
        heartedAt: h.createdAt,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}
