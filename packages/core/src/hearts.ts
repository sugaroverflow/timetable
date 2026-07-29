import { and, eq } from "drizzle-orm";

import { db, hearts, topics } from "@timetable/db";

import { logActivity } from "./activity";
import { markTopicSeen } from "./queue";
import { getHeartsCountFrom } from "./topics";

/** Toggle an elector's heart on a published topic. Returns the new state.
 * Hearts are logged to the activity feed (QA #42).
 *
 * The toggle is relative to the COUNTED state (queue v2, 2026-07-29): a
 * heart row from before the timetable's heartsCountFrom cutoff is a dead
 * vote — every surface shows the topic as unhearted — so hearting again
 * must revive it (bump createdAt past the cutoff), not delete the dead
 * row and silently invert the user's intent. */
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
    .select({ id: hearts.id, createdAt: hearts.createdAt })
    .from(hearts)
    .where(and(eq(hearts.topicId, topicId), eq(hearts.userId, userId)))
    .limit(1);
  const cutoff = await getHeartsCountFrom(topic.timetableId);
  const counted =
    existing !== undefined && (cutoff === null || existing.createdAt >= cutoff);

  if (counted) {
    await db.delete(hearts).where(eq(hearts.id, existing!.id));
  } else {
    // A fresh vote with a fresh createdAt. onConflictDoUpdate both guards
    // the rare double-submit race against the unique (topicId, userId)
    // index AND revives a pre-cutoff row by bumping it past the cutoff.
    await db
      .insert(hearts)
      .values({ topicId, userId })
      .onConflictDoUpdate({
        target: [hearts.topicId, hearts.userId],
        set: { createdAt: new Date() },
      });
    // Hearting implies having seen it — from any surface, not just the
    // queue. (Un-hearting keeps the seen row: they did see it.)
    await markTopicSeen(topicId, userId);
  }

  await logActivity({
    timetableId: topic.timetableId,
    actorId: userId,
    action: counted ? "heart.remove" : "heart.add",
    payload: { topicId, title: topic.title },
  });

  return { hearted: !counted };
}
