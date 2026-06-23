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
    .select({ id: hearts.id })
    .from(hearts)
    .where(and(eq(hearts.topicId, topicId), eq(hearts.userId, userId)))
    .limit(1);

  if (existing) {
    await db.delete(hearts).where(eq(hearts.id, existing.id));
    return { hearted: false };
  }

  await db.insert(hearts).values({ topicId, userId });
  return { hearted: true };
}
