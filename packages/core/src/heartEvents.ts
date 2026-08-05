import { eq } from "drizzle-orm";

import { db, heartEvents } from "@timetable/db";

/**
 * Append-only ❤️/💙 ledger (2026-08-05). The `hearts`/`host_hearts` tables
 * hold mutable current state: an un-heart deletes its row and a post-cutoff
 * revival overwrites `createdAt`, so on their own they can't answer "what
 * did the votes look like last term?". Every toggle also appends an event
 * here, and nothing ever updates or deletes one, so the full gesture
 * history survives un-hearts and termly cutoff resets. Admin-facing only
 * (data export); no product surface renders it.
 */

export type HeartEventKind = "heart" | "host_heart";
export type HeartEventAction = "add" | "remove";

export async function recordHeartEvent(event: {
  timetableId: string;
  topicId: string;
  userId: string;
  kind: HeartEventKind;
  action: HeartEventAction;
}): Promise<void> {
  await db.insert(heartEvents).values(event);
}

export type HeartEvent = {
  topicId: string;
  userId: string;
  kind: HeartEventKind;
  action: HeartEventAction;
  createdAt: Date;
};

/** The timetable's full gesture history, oldest first. */
export async function listHeartEvents(
  timetableId: string,
): Promise<HeartEvent[]> {
  const rows = await db
    .select({
      topicId: heartEvents.topicId,
      userId: heartEvents.userId,
      kind: heartEvents.kind,
      action: heartEvents.action,
      createdAt: heartEvents.createdAt,
    })
    .from(heartEvents)
    .where(eq(heartEvents.timetableId, timetableId))
    .orderBy(heartEvents.createdAt);
  return rows;
}
