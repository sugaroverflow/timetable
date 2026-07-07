import { and, eq } from "drizzle-orm";

import { db, hearts, topics } from "@timetable/db";

import { logActivity } from "./activity";

/** Toggle an elector's heart on a published topic. Returns the new state.
 * Hearts are logged to the activity feed (QA #42). Whether a heart *counts*
 * is a separate question — hearts created before the timetable's
 * heartsCountFrom cutoff are ignored by the counting queries. */
export async function toggleHeart(
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
    throw new Error("Only published topics can be hearted");
  }

  const [existing] = await db
    .select({ id: hearts.id })
    .from(hearts)
    .where(and(eq(hearts.topicId, topicId), eq(hearts.userId, userId)))
    .limit(1);

  if (existing) {
    await db.delete(hearts).where(eq(hearts.id, existing.id));
  } else {
    // Re-hearting after removing (or after a cutoff) is a fresh vote with a
    // fresh createdAt. onConflictDoUpdate guards the rare double-submit race
    // against the unique (topicId, userId) index.
    await db
      .insert(hearts)
      .values({ topicId, userId })
      .onConflictDoUpdate({
        target: [hearts.topicId, hearts.userId],
        set: { createdAt: new Date() },
      });
  }

  await logActivity({
    timetableId: topic.timetableId,
    actorId: userId,
    action: existing ? "heart.remove" : "heart.add",
    payload: { topicId, title: topic.title },
  });

  return { hearted: !existing };
}
