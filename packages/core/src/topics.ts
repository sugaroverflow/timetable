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
      status: "draft",
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
    if (current && current.publishedAt === null && input.title !== current.title) {
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

/** Host submits a draft for moderation. */
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

/** Every host's drafts — surfaced read-only to admins so forgotten drafts
 * don't go unnoticed (QA #59). */
export async function listDraftTopics(timetableId: string): Promise<Topic[]> {
  return db
    .select()
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "draft")),
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

/**
 * Number of published topics this user currently hearts (post-cutoff).
 * The user's per-heart vote weight is 1/count — shown to them in the feed.
 */
export async function countViewerPublishedHearts(
  timetableId: string,
  userId: string,
): Promise<number> {
  const cutoff = await getHeartsCountFrom(timetableId);
  const conds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published"),
    eq(hearts.userId, userId),
  ];
  if (cutoff) conds.push(gte(hearts.createdAt, cutoff));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(and(...conds));
  return row?.n ?? 0;
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
  const allPublished = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "published")),
    );
  const publishedIdSet = new Set(allPublished.map((r) => r.id));

  if (publishedIdSet.size === 0) return [];

  // All post-cutoff hearts on published topics in the timetable.
  const cutoff = await getHeartsCountFrom(timetableId);
  const heartConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published"),
  ];
  if (cutoff) heartConds.push(gte(hearts.createdAt, cutoff));
  const heartRows = await db
    .select({ topicId: hearts.topicId, electorId: hearts.userId })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(and(...heartConds));

  const heartCounts = computeElectorHeartCounts(heartRows, publishedIdSet);

  const heartsByTopic = new Map<string, string[]>();
  for (const h of heartRows) {
    const list = heartsByTopic.get(h.topicId) ?? [];
    list.push(h.electorId);
    heartsByTopic.set(h.topicId, list);
  }

  // Displayed topics (optionally filtered to one host).
  const displayConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published"),
  ];
  if (opts.hostId) displayConds.push(eq(topics.hostId, opts.hostId));
  if (opts.topicId) displayConds.push(eq(topics.id, opts.topicId));

  const rows = await db
    .select({
      topic: topics,
      hostName: users.name,
      hostImage: users.image,
      hostSlug: users.slug,
    })
    .from(topics)
    .innerJoin(users, eq(users.id, topics.hostId))
    .where(and(...displayConds));

  const displayedIds = rows.map((r) => r.topic.id);

  // Public, non-hidden comment counts and latest-comment timestamps.
  const commentStats = new Map<
    string,
    { count: number; latestCommentAt: Date | null }
  >();
  if (displayedIds.length > 0) {
    const statRows = await db
      .select({
        topicId: comments.topicId,
        count: sql<number>`count(*)::int`,
        latestCommentAt: sql<Date | null>`max(${comments.createdAt})`,
      })
      .from(comments)
      .where(
        and(
          inArray(comments.topicId, displayedIds),
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
  }

  const feed: FeedTopic[] = rows.map(({ topic, hostName, hostImage, hostSlug }) => {
    const topicHearts = (heartsByTopic.get(topic.id) ?? []).map(
      (electorId) => ({ topicId: topic.id, electorId }),
    );
    const norms = topicNormScores(topicHearts, heartCounts);
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
      viewerHasHearted: viewerUserId
        ? topicHearts.some((h) => h.electorId === viewerUserId)
        : false,
      commentCount: commentStats.get(topic.id)?.count ?? 0,
      latestCommentAt: commentStats.get(topic.id)?.latestCommentAt ?? null,
    };
  });

  const visibleFeed =
    opts.heartedByViewer && viewerUserId
      ? feed.filter((t) => t.viewerHasHearted)
      : feed;

  const sort = opts.sort ?? "hearts";
  const seed = opts.seed ?? "";
  // "Newest" counts content edits, not just publication (QA #59).
  const recency = (t: FeedTopic) =>
    Math.max(
      t.publishedAt?.getTime() ?? t.createdAt.getTime(),
      t.contentUpdatedAt?.getTime() ?? 0,
    );
  // Score used by the normalisation sorts ("hearts" is a legacy alias for L1).
  const normScore = (t: FeedTopic): number => {
    switch (sort) {
      case "raw":
        return t.heartCount;
      case "l2":
        return t.l2Score;
      case "devotion":
        return t.devotionScore;
      default:
        return t.weightedScore; // "l1" and legacy "hearts"
    }
  };
  visibleFeed.sort((a, b) => {
    if (sort === "comments") {
      const at = a.latestCommentAt?.getTime() ?? 0;
      const bt = b.latestCommentAt?.getTime() ?? 0;
      if (bt !== at) return bt - at;
      return b.commentCount - a.commentCount;
    }
    if (sort === "recent") {
      return recency(b) - recency(a);
    }
    if (sort === "random") {
      return seededRank(seed, a.id) - seededRank(seed, b.id);
    }
    const diff = normScore(b) - normScore(a);
    // Stable tie-break so equal scores don't jitter between requests.
    return diff !== 0 ? diff : recency(b) - recency(a);
  });

  const offset = Math.max(0, opts.offset ?? 0);
  if (opts.limit === undefined) return visibleFeed.slice(offset);

  const limit = Math.max(1, Math.min(opts.limit, 50));
  return visibleFeed.slice(offset, offset + limit);
}

export type WeightedHeartEntry = {
  electorId: string;
  electorName: string | null;
  weight: number;
};

/** Host-only per-elector weighted-heart breakdown for one topic. */
export async function getWeightedBreakdown(
  timetableId: string,
  topicId: string,
): Promise<WeightedHeartEntry[]> {
  const allPublished = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "published")),
    );
  const publishedIdSet = new Set(allPublished.map((r) => r.id));

  const cutoff = await getHeartsCountFrom(timetableId);
  const heartConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published"),
  ];
  if (cutoff) heartConds.push(gte(hearts.createdAt, cutoff));
  const heartRows = await db
    .select({ topicId: hearts.topicId, electorId: hearts.userId })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(and(...heartConds));
  const weights = computeElectorWeights(heartRows, publishedIdSet);

  const topicHeartUserIds = heartRows
    .filter((h) => h.topicId === topicId)
    .map((h) => h.electorId);

  if (topicHeartUserIds.length === 0) return [];

  const electorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, topicHeartUserIds));
  const nameById = new Map(electorRows.map((u) => [u.id, u.name]));

  return topicHeartUserIds
    .map((electorId) => ({
      electorId,
      electorName: nameById.get(electorId) ?? null,
      weight: weights.get(electorId) ?? 0,
    }))
    .sort((a, b) => b.weight - a.weight);
}
