import { and, eq, inArray } from "drizzle-orm";

import { db, hostHearts, timetableMemberships, topics } from "@timetable/db";

import {
  computeElectorHeartCounts,
  computeElectorWeights,
  topicNormScores,
  type TopicNormScores,
} from "@timetable/shared";

import { logActivity } from "./activity";
import { recordHeartEvent } from "./heartEvents";
import { markTopicSeen } from "./queue";
import type { WeightedHeartEntry } from "./topics";

/**
 * Host 💙s (2026-08-04): the parallel gesture for host-non-elector members.
 * Deliberately separate from the elector `hearts` table so 💙s never enter
 * elector weighting, feed ranking, or vote counts — and deliberately NOT
 * subject to the heartsCountFrom cutoff: a 💙 is interest, not a ballot, so
 * a voting-round reset leaves it alone. Tallies are admin-only; the
 * attributed names row in the host-only thread is the one host-visible
 * surface.
 */

/** Toggle a host's 💙 on a published topic. Returns the new state. */
export async function toggleHostHeart(
  topicId: string,
  userId: string,
): Promise<{ hearted: boolean }> {
  const [topic] = await db
    .select({
      status: topics.status,
      title: topics.title,
      timetableId: topics.timetableId,
    })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);

  if (!topic) throw new Error("Topic not found");
  if (topic.status !== "published") {
    throw new Error("Only published topics can be 💙'd");
  }

  const [existing] = await db
    .select({ id: hostHearts.id })
    .from(hostHearts)
    .where(and(eq(hostHearts.topicId, topicId), eq(hostHearts.userId, userId)))
    .limit(1);

  if (existing) {
    await db.delete(hostHearts).where(eq(hostHearts.id, existing.id));
  } else {
    // onConflictDoNothing guards the double-submit race against the unique
    // (topicId, userId) index. No cutoff/revival dance here — 💙s ignore
    // heartsCountFrom entirely.
    await db
      .insert(hostHearts)
      .values({ topicId, userId })
      .onConflictDoNothing({ target: [hostHearts.topicId, hostHearts.userId] });
    // 💙ing implies having seen it, same as hearting.
    await markTopicSeen(topicId, userId);
  }

  await recordHeartEvent({
    timetableId: topic.timetableId,
    topicId,
    userId,
    kind: "host_heart",
    action: existing ? "remove" : "add",
  });
  await logActivity({
    timetableId: topic.timetableId,
    actorId: userId,
    action: existing ? "hostheart.remove" : "hostheart.add",
    payload: { topicId, title: topic.title },
  });

  return { hearted: !existing };
}

export type HostHearter = {
  userId: string;
  name: string | null;
  image: string | null;
  slug: string | null;
  heartedAt: Date;
};

/** Attributed 💙 list for one topic's host-only thread row ("💙 Sarah,
 * Amir"). Per-forum profile fields via the membership join; hosts who left
 * the forum keep their row with null profile fields. */
export async function listTopicHostHearters(
  timetableId: string,
  topicId: string,
): Promise<HostHearter[]> {
  const rows = await db
    .select({
      userId: hostHearts.userId,
      createdAt: hostHearts.createdAt,
      name: timetableMemberships.name,
      image: timetableMemberships.image,
      slug: timetableMemberships.slug,
    })
    .from(hostHearts)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, hostHearts.userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .where(eq(hostHearts.topicId, topicId));
  return rows
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      image: r.image,
      slug: r.slug,
      heartedAt: r.createdAt,
    }))
    .sort((a, b) => a.heartedAt.getTime() - b.heartedAt.getTime());
}

type PublishedHostHeart = {
  topicId: string;
  electorId: string;
  createdAt: Date;
};

/** All 💙s on published topics in the timetable (optionally one user's).
 * HeartRef-shaped so the shared normalisation math applies verbatim —
 * "each host distributes one unit of interest across the topics they 💙".
 * No cutoff: 💙s are unaffected by heartsCountFrom. */
async function loadPublishedHostHearts(
  timetableId: string,
  opts: { userId?: string } = {},
): Promise<PublishedHostHeart[]> {
  const conds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published" as const),
  ];
  if (opts.userId) conds.push(eq(hostHearts.userId, opts.userId));
  return db
    .select({
      topicId: hostHearts.topicId,
      electorId: hostHearts.userId,
      createdAt: hostHearts.createdAt,
    })
    .from(hostHearts)
    .innerJoin(topics, eq(topics.id, hostHearts.topicId))
    .where(and(...conds));
}

/** Which of `topicIds` the viewer currently 💙s — the resolvers' batched
 * prefetch for viewerHasHostHearted. */
export async function listViewerHostHeartedTopicIds(
  userId: string,
  topicIds: string[],
): Promise<Set<string>> {
  if (topicIds.length === 0) return new Set();
  const rows = await db
    .select({ topicId: hostHearts.topicId })
    .from(hostHearts)
    .where(
      and(eq(hostHearts.userId, userId), inArray(hostHearts.topicId, topicIds)),
    );
  return new Set(rows.map((r) => r.topicId));
}

/** Per-topic 💙 normalisation scores keyed by topic id (admin analysis).
 * Same four modes as elector ❤️s, over pre-loaded host_hearts rows (all on
 * published topics by construction, so the rows themselves are the
 * denominator universe). */
export function computeHostHeartScores(
  rows: readonly PublishedHostHeart[],
): Map<string, TopicNormScores> {
  const publishedIds = new Set(rows.map((r) => r.topicId));
  const counts = computeElectorHeartCounts(rows, publishedIds);
  const byTopic = new Map<string, PublishedHostHeart[]>();
  for (const row of rows) {
    const list = byTopic.get(row.topicId) ?? [];
    list.push(row);
    byTopic.set(row.topicId, list);
  }
  const scores = new Map<string, TopicNormScores>();
  for (const [topicId, topicRows] of byTopic) {
    scores.set(topicId, topicNormScores(topicRows, counts));
  }
  return scores;
}

/** Admin-only per-host 💙 breakdown for one topic — the hosts-instead-of-
 * electors dropdown when the analysis table sorts by 💙. Same entry shape
 * as the elector breakdown so the web table can reuse its renderer. */
export async function getHostHeartBreakdown(
  timetableId: string,
  topicId: string,
): Promise<WeightedHeartEntry[]> {
  const heartRows = await loadPublishedHostHearts(timetableId);
  const topicRows = heartRows.filter((h) => h.topicId === topicId);
  if (topicRows.length === 0) return [];

  const publishedIds = new Set(heartRows.map((h) => h.topicId));
  const weights = computeElectorWeights(heartRows, publishedIds);
  const counts = computeElectorHeartCounts(heartRows, publishedIds);

  const memberRows = await db
    .select({
      id: timetableMemberships.userId,
      name: timetableMemberships.name,
      image: timetableMemberships.image,
    })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        inArray(
          timetableMemberships.userId,
          topicRows.map((h) => h.electorId),
        ),
      ),
    );
  const memberById = new Map(memberRows.map((u) => [u.id, u]));

  return topicRows
    .map((h) => {
      const n = counts.get(h.electorId) ?? 0;
      const weight = weights.get(h.electorId) ?? 0;
      return {
        electorId: h.electorId,
        electorName: memberById.get(h.electorId)?.name ?? null,
        electorImage: memberById.get(h.electorId)?.image ?? null,
        weight,
        l2Weight: n > 0 ? 1 / Math.sqrt(n) : 0,
        devotionWeight: weight / topicRows.length,
        heartedAt: h.createdAt,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}
