import { eq, sql } from "drizzle-orm";

import {
  db,
  timetables,
  type Timetable,
  type TimetableSettings,
} from "@timetable/db";

/** Shallow-merge a partial settings patch into a timetable's settings JSON.
 * The merge happens IN the database (`jsonb ||`), not read-modify-write:
 * two admins saving different settings cards concurrently used to race,
 * with the loser's card silently reverted (audit 2026-08-17). Same
 * shallow semantics as `{ ...current, ...patch }`. */
export async function updateTimetableSettings(
  timetableId: string,
  patch: Partial<TimetableSettings>,
): Promise<Timetable | null> {
  const [updated] = await db
    .update(timetables)
    .set({
      settings: sql`coalesce(${timetables.settings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(timetables.id, timetableId))
    .returning();
  return updated ?? null;
}
