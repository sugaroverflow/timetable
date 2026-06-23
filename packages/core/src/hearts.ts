import { and, eq } from "drizzle-orm";

import { db, hearts, topics } from "@timetable/db";

/** Toggle an elector's heart on a published topic. Returns the new state. */
export async function toggleHeart(
  topicId: string,
  userId: string,
): Promise<{ hearted: boolean }> {
  const [topic] = await db
    .select({ status: topics.status })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);

  if (!topic) throw new Error("Topic not found");
  if (topic.status !== "published") {
    throw new Error("Only published topics can be hearted");
  }

  const [existing] = await db
    .select({ id: hearts.id, archivedAt: hearts.archivedAt })
    .from(hearts)
    .where(and(eq(hearts.topicId, topicId), eq(hearts.userId, userId)))
    .limit(1);

  // Only an active (non-archived) heart counts as "hearted". Toggling it off
  // removes it.
  if (existing && existing.archivedAt === null) {
    await db.delete(hearts).where(eq(hearts.id, existing.id));
    return { hearted: false };
  }

  // No active heart: create one, or reactivate an archived row in place (the
  // unique (topicId, userId) constraint means we can't blindly insert a second
  // row). Re-hearting after an admin reset is a fresh vote.
  await db
    .insert(hearts)
    .values({ topicId, userId })
    .onConflictDoUpdate({
      target: [hearts.topicId, hearts.userId],
      set: { archivedAt: null, createdAt: new Date() },
    });
  return { hearted: true };
}
