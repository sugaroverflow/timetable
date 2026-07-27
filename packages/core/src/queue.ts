import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import {
  db,
  hearts,
  timetableMemberships,
  topics,
  topicSeen,
} from "@timetable/db";

/**
 * Topic Queue (2026-07-28): every elector gets a private, stable ordering of
 * the published topics they haven't ❤️'d, shown one at a time. Marking a
 * topic seen (the "Later" button) or hearting it advances the queue; when
 * everything has been seen the round ends explicitly, and restarting begins
 * a fresh round of whatever is still unhearted. Topics published after the
 * current round started are "new" and jump to the front.
 */

export type TopicQueueState = {
  /** The topic to show next, or null when the round is complete. */
  currentTopicId: string | null;
  /** Unseen-this-round, unhearted topics (includes the new ones). */
  remaining: number;
  /** Subset of `remaining` published after the round started (🆕). */
  remainingNew: number;
  /** All unhearted published topics — the size of the current round. */
  roundSize: number;
};

/** Per-user deterministic shuffle: order by md5(userId:topicId). Stable
 * across sessions and devices with no stored ordering, and different per
 * user so topics get even exposure across the electorate (the same
 * fairness instinct as the feed's Shuffle sort). */
function queueOrderKey(userId: string, topicId: string): string {
  return createHash("md5").update(`${userId}:${topicId}`).digest("hex");
}

export async function getTopicQueue(
  timetableId: string,
  userId: string,
): Promise<TopicQueueState> {
  const [membership] = await db
    .select({ roundStartedAt: timetableMemberships.queueRoundStartedAt })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .limit(1);
  const roundStart = membership?.roundStartedAt ?? null;

  const published = await db
    .select({ id: topics.id, publishedAt: topics.publishedAt })
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "published")),
    );
  if (published.length === 0) {
    return {
      currentTopicId: null,
      remaining: 0,
      remainingNew: 0,
      roundSize: 0,
    };
  }

  const ids = published.map((t) => t.id);
  const heartedRows = await db
    .select({ topicId: hearts.topicId })
    .from(hearts)
    .where(and(eq(hearts.userId, userId), inArray(hearts.topicId, ids)));
  const hearted = new Set(heartedRows.map((r) => r.topicId));

  const seenRows = await db
    .select({ topicId: topicSeen.topicId, seenAt: topicSeen.seenAt })
    .from(topicSeen)
    .where(and(eq(topicSeen.userId, userId), inArray(topicSeen.topicId, ids)));
  // Null roundStart = the first round: every seen row counts as seen.
  const seenThisRound = new Set(
    seenRows
      .filter((r) => roundStart === null || r.seenAt >= roundStart)
      .map((r) => r.topicId),
  );

  const eligible = published.filter((t) => !hearted.has(t.id));
  const isNew = (t: { publishedAt: Date | null }): boolean =>
    roundStart !== null && t.publishedAt !== null && t.publishedAt > roundStart;

  const remaining = eligible
    .filter((t) => !seenThisRound.has(t.id))
    .sort((a, b) => {
      // Just-published topics jump the queue; within each group the
      // per-user shuffle order holds.
      const newDiff = Number(isNew(b)) - Number(isNew(a));
      if (newDiff !== 0) return newDiff;
      return queueOrderKey(userId, a.id).localeCompare(
        queueOrderKey(userId, b.id),
      );
    });

  return {
    currentTopicId: remaining[0]?.id ?? null,
    remaining: remaining.length,
    remainingNew: remaining.filter(isNew).length,
    roundSize: eligible.length,
  };
}

/** Analysis coverage (the Elector activity table's "Queue" column): how
 * many published topics each user has EVER seen or hearted. Unlike the
 * personal queue count this ignores round restarts — it answers "how much
 * has this elector never been exposed to", stably. Hearts are unioned in
 * because pre-queue hearts have no seen row. */
export async function loadQueueCoverage(timetableId: string): Promise<{
  publishedCount: number;
  coveredByUser: Map<string, number>;
}> {
  const published = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "published")),
    );
  if (published.length === 0) {
    return { publishedCount: 0, coveredByUser: new Map() };
  }
  const ids = published.map((t) => t.id);

  const [seenRows, heartRows] = await Promise.all([
    db
      .select({ userId: topicSeen.userId, topicId: topicSeen.topicId })
      .from(topicSeen)
      .where(inArray(topicSeen.topicId, ids)),
    db
      .select({ userId: hearts.userId, topicId: hearts.topicId })
      .from(hearts)
      .where(inArray(hearts.topicId, ids)),
  ]);

  const covered = new Map<string, Set<string>>();
  for (const row of [...seenRows, ...heartRows]) {
    const set = covered.get(row.userId) ?? new Set<string>();
    set.add(row.topicId);
    covered.set(row.userId, set);
  }
  return {
    publishedCount: published.length,
    coveredByUser: new Map(
      [...covered.entries()].map(([userId, set]) => [userId, set.size]),
    ),
  };
}

/** Record that the user has been shown this topic (the queue's "Later"
 * button; hearting records it too via toggleHeart). Upsert bumps seenAt so
 * the row also means "last seen". */
export async function markTopicSeen(
  topicId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(topicSeen)
    .values({ topicId, userId })
    .onConflictDoUpdate({
      target: [topicSeen.topicId, topicSeen.userId],
      set: { seenAt: new Date() },
    });
}

/** Begin a fresh queue round: everything unhearted comes around again. */
export async function restartQueueRound(
  timetableId: string,
  userId: string,
): Promise<boolean> {
  const updated = await db
    .update(timetableMemberships)
    .set({ queueRoundStartedAt: new Date() })
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .returning({ id: timetableMemberships.id });
  return updated.length > 0;
}
