import { desc, eq } from "drizzle-orm";

import { activityEvents, db, users } from "@timetable/db";

export type ActivityInput = {
  timetableId: string;
  actorId: string | null;
  action: string;
  payload?: Record<string, unknown>;
  note?: string | null;
};

export async function logActivity(input: ActivityInput): Promise<void> {
  await db.insert(activityEvents).values({
    timetableId: input.timetableId,
    actorId: input.actorId,
    action: input.action,
    payload: input.payload ?? {},
    note: input.note ?? null,
  });
}

export type ActivityEntry = {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  note: string | null;
  createdAt: Date;
  actorName: string | null;
};

export async function listActivity(
  timetableId: string,
  limit = 100,
): Promise<ActivityEntry[]> {
  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      payload: activityEvents.payload,
      note: activityEvents.note,
      createdAt: activityEvents.createdAt,
      actorName: users.name,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .where(eq(activityEvents.timetableId, timetableId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    payload: r.payload,
    note: r.note,
    createdAt: r.createdAt,
    actorName: r.actorName,
  }));
}
