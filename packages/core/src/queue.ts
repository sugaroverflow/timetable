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
 * Topic Queue (2026-07-28; v2 2026-07-29): every member gets a private,
 * stable ordering of the published topics they haven't reviewed, shown one
 * at a time. Electors review with a ❤️ switcher and a Next button; other
 * members read through with Next alone. When everything has been seen the
 * round ends explicitly; restarting begins a fresh review of EVERY
 * published topic. Topics published after the current round started are
 * "new" and jump to the front.
 *
 * The forum's `heartsCountFrom` cutoff resets the queue for everyone
 * (fresh-eyes review, e.g. at the start of a term): seen marks and hearts
 * from before the cutoff stop counting as "reviewed", so previously
 * ❤️'d topics come back around to be re-affirmed or un-❤️'d.
 */

export type TopicQueueState = {
  /** The topic to show next, or null when the round is complete. */
  currentTopicId: string | null;
  /** Not-yet-reviewed-this-round topics (includes the new ones). */
  remaining: number;
  /** Subset of `remaining` published after the round started (🆕). */
  remainingNew: number;
  /** All published topics — the size of a full round. */
  roundSize: number;
  /** Published topics never seen (nor ❤️'d) since the forum's cutoff —
   * the sidebar badge and the Analysis "Queue" column. Unlike `remaining`
   * this ignores round restarts, so it only ever shrinks (to zero, where
   * the badge hides) until the cutoff moves. */
  neverSeenCount: number;
};

/** Per-user deterministic shuffle: order by md5(userId:topicId). Stable
 * across sessions and devices with no stored ordering, and different per
 * user so topics get even exposure across the electorate (the same
 * fairness instinct as the feed's Shuffle sort). */
function queueOrderKey(userId: string, topicId: string): string {
  return createHash("md5").update(`${userId}:${topicId}`).digest("hex");
}

/** The later of two nullable instants; null when both are unset. */
function laterOf(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

export async function getTopicQueue(
  timetableId: string,
  userId: string,
  /** The forum's heartsCountFrom: review marks before this don't count. */
  cutoff: Date | null = null,
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
  // The round effectively starts at the later of the member's own restart
  // and the forum-wide cutoff — moving the cutoff restarts every queue.
  const roundStart = laterOf(membership?.roundStartedAt ?? null, cutoff);

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
      neverSeenCount: 0,
    };
  }

  const ids = published.map((t) => t.id);
  // Hearts union in as "reviewed" because pre-queue hearts have no seen
  // row; since the queue shipped, hearting also writes one (toggleHeart).
  const heartedRows = await db
    .select({ topicId: hearts.topicId, heartedAt: hearts.createdAt })
    .from(hearts)
    .where(and(eq(hearts.userId, userId), inArray(hearts.topicId, ids)));
  const seenRows = await db
    .select({ topicId: topicSeen.topicId, seenAt: topicSeen.seenAt })
    .from(topicSeen)
    .where(and(eq(topicSeen.userId, userId), inArray(topicSeen.topicId, ids)));

  const reviewedSince = (since: Date | null): Set<string> => {
    const set = new Set<string>();
    for (const r of seenRows) {
      if (since === null || r.seenAt >= since) set.add(r.topicId);
    }
    for (const r of heartedRows) {
      if (since === null || r.heartedAt >= since) set.add(r.topicId);
    }
    return set;
  };

  const reviewedThisRound = reviewedSince(roundStart);
  const reviewedSinceCutoff = reviewedSince(cutoff);

  const isNew = (t: { publishedAt: Date | null }): boolean =>
    roundStart !== null && t.publishedAt !== null && t.publishedAt > roundStart;

  const remaining = published
    .filter((t) => !reviewedThisRound.has(t.id))
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
    roundSize: published.length,
    neverSeenCount: published.filter((t) => !reviewedSinceCutoff.has(t.id))
      .length,
  };
}

/** Analysis coverage (the activity tables' "Queue" column): how many
 * published topics each user has seen or hearted since the forum's
 * cutoff. Ignores round restarts — it answers "how much has this member
 * never been exposed to", stably — but moving `heartsCountFrom` resets it
 * for everyone (the fresh-eyes review). */
export async function loadQueueCoverage(
  timetableId: string,
  cutoff: Date | null = null,
): Promise<{
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
      .select({
        userId: topicSeen.userId,
        topicId: topicSeen.topicId,
        at: topicSeen.seenAt,
      })
      .from(topicSeen)
      .where(inArray(topicSeen.topicId, ids)),
    db
      .select({
        userId: hearts.userId,
        topicId: hearts.topicId,
        at: hearts.createdAt,
      })
      .from(hearts)
      .where(inArray(hearts.topicId, ids)),
  ]);

  const covered = new Map<string, Set<string>>();
  for (const row of [...seenRows, ...heartRows]) {
    if (cutoff !== null && row.at < cutoff) continue;
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

/** Record that the user has been shown this topic (the queue's Next
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

/** Begin a fresh queue round: every published topic comes around again. */
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
