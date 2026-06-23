import { eq } from "drizzle-orm";

import {
  db,
  timetables,
  type Timetable,
  type TimetableSettings,
} from "@timetable/db";

/** Shallow-merge a partial settings patch into a timetable's settings JSON. */
export async function updateTimetableSettings(
  timetableId: string,
  patch: Partial<TimetableSettings>,
): Promise<Timetable | null> {
  const [current] = await db
    .select({ settings: timetables.settings })
    .from(timetables)
    .where(eq(timetables.id, timetableId))
    .limit(1);

  const merged: TimetableSettings = { ...(current?.settings ?? {}), ...patch };

  const [updated] = await db
    .update(timetables)
    .set({ settings: merged, updatedAt: new Date() })
    .where(eq(timetables.id, timetableId))
    .returning();
  return updated ?? null;
}
