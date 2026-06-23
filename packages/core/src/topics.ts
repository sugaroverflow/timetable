import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  comments,
  db,
  hearts,
  topics,
  users,
  type Topic,
  type TopicStatus,
} from "@timetable/db";
import { computeElectorWeights, topicWeightedScore } from "@timetable/shared";

import { logActivity } from "./activity";

export async function getTopicById(topicId: string): Promise<Topic | null> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return topic ?? null;
}

export async function createTopic(
  timetableId: string,
  hostId: string,
  input: { title: string; bodyMd?: string; coverImageUrl?: string | null },
): Promise<Topic> {
  const [topic] = await db
    .insert(topics)
    .values({
      timetableId,
      hostId,
      title: input.title,
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
  const [updated] = await db
    .update(topics)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.bodyMd !== undefined ? { bodyMd: input.bodyMd } : {}),
      ...(input.coverImageUrl !== undefined
        ? { coverImageUrl: input.coverImageUrl }
        : {}),
      updatedAt: new Date(),
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

export type ModerationAction = "publish" | "reject" | "request_changes";

/** Admin moderation: publish, reject, or request changes (with feedback). */
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

  if (action === "reject") {
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

  // request_changes: send the topic back to draft with host-only feedback.
  const updated = await setStatus(topic.id, "draft");
  if (note && note.trim()) {
    await db.insert(comments).values({
      topicId: topic.id,
      authorId: actorId,
      body: note.trim(),
      visibility: "host_only",
    });
  }
  await logActivity({
    timetableId: topic.timetableId,
    actorId,
    action: "topic.request_changes",
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

/** Admin: archive (reset) all active hearts on a topic. Returns the count. */
export async function archiveTopicHearts(
  topic: Topic,
  actorId: string,
): Promise<number> {
  const archived = await db
    .update(hearts)
    .set({ archivedAt: new Date() })
    .where(and(eq(hearts.topicId, topic.id), isNull(hearts.archivedAt)))
    .returning({ id: hearts.id });

  await logActivity({
    timetableId: topic.timetableId,
    actorId,
    action: "hearts.archive",
    payload: { topicId: topic.id, title: topic.title, count: archived.length },
  });

  return archived.length;
}

export type FeedSort = "hearts" | "comments" | "recent";

export type FeedTopic = {
  id: string;
  timetableId: string;
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  title: string;
  bodyMd: string;
  coverImageUrl: string | null;
  status: TopicStatus;
  publishedAt: Date | null;
  createdAt: Date;
  heartCount: number;
  weightedScore: number;
  viewerHasHearted: boolean;
  commentCount: number;
  latestCommentAt: Date | null;
};

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
    sort?: FeedSort;
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

  // All (non-archived) hearts on published topics in the timetable.
  const heartRows = await db
    .select({ topicId: hearts.topicId, electorId: hearts.userId })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(
      and(
        eq(topics.timetableId, timetableId),
        eq(topics.status, "published"),
        isNull(hearts.archivedAt),
      ),
    );

  const weights = computeElectorWeights(heartRows, publishedIdSet);

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

  const rows = await db
    .select({
      topic: topics,
      hostName: users.name,
      hostImage: users.image,
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
        latestCommentAt: c.latestCommentAt,
      });
    }
  }

  const feed: FeedTopic[] = rows.map(({ topic, hostName, hostImage }) => {
    const topicHearts = (heartsByTopic.get(topic.id) ?? []).map(
      (electorId) => ({ topicId: topic.id, electorId }),
    );
    return {
      id: topic.id,
      timetableId: topic.timetableId,
      hostId: topic.hostId,
      hostName,
      hostImage,
      title: topic.title,
      bodyMd: topic.bodyMd,
      coverImageUrl: topic.coverImageUrl,
      status: topic.status,
      publishedAt: topic.publishedAt,
      createdAt: topic.createdAt,
      heartCount: topicHearts.length,
      weightedScore: topicWeightedScore(topicHearts, weights),
      viewerHasHearted: viewerUserId
        ? topicHearts.some((h) => h.electorId === viewerUserId)
        : false,
      commentCount: commentStats.get(topic.id)?.count ?? 0,
      latestCommentAt: commentStats.get(topic.id)?.latestCommentAt ?? null,
    };
  });

  const sort = opts.sort ?? "hearts";
  feed.sort((a, b) => {
    if (sort === "comments") {
      const at = a.latestCommentAt?.getTime() ?? 0;
      const bt = b.latestCommentAt?.getTime() ?? 0;
      if (bt !== at) return bt - at;
      return b.commentCount - a.commentCount;
    }
    if (sort === "recent") {
      const at = a.publishedAt?.getTime() ?? a.createdAt.getTime();
      const bt = b.publishedAt?.getTime() ?? b.createdAt.getTime();
      return bt - at;
    }
    return b.weightedScore - a.weightedScore;
  });

  const offset = Math.max(0, opts.offset ?? 0);
  if (opts.limit === undefined) return feed.slice(offset);

  const limit = Math.max(1, Math.min(opts.limit, 50));
  return feed.slice(offset, offset + limit);
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

  const heartRows = await db
    .select({ topicId: hearts.topicId, electorId: hearts.userId })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(
      and(
        eq(topics.timetableId, timetableId),
        eq(topics.status, "published"),
        isNull(hearts.archivedAt),
      ),
    );
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
