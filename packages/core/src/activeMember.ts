import { and, eq, isNotNull, notExists, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db, timetableMemberships } from "@timetable/db";

/**
 * active-member-filter (Ed, 2026-09-11): a WHERE condition that drops a
 * heart / 💙 whose giver is a DEACTIVATED member of the forum. Deactivation
 * keeps every row (it is reversible — see member-deactivation), so the
 * person's ❤️s are hidden at read time instead: they leave every ranking,
 * count and avatar list while the stamp is set and return on reactivation.
 *
 * Written as NOT EXISTS rather than a join so that a heart from someone who
 * was REMOVED from the forum (no membership row at all) keeps counting
 * exactly as it did before — this only knows about deactivation.
 *
 * `userId` is the giver column (`hearts.userId`, `hostHearts.userId`);
 * `timetableId` is the forum the heart belongs to, normally the joined
 * topic's `topics.timetableId`.
 */
export function givenByActiveMember(
  userId: AnyPgColumn,
  timetableId: AnyPgColumn | SQL,
): SQL {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(timetableMemberships)
      .where(
        and(
          eq(timetableMemberships.userId, userId),
          eq(timetableMemberships.timetableId, timetableId),
          isNotNull(timetableMemberships.deactivatedAt),
        ),
      ),
  );
}
