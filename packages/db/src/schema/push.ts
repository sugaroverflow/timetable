import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timetableMemberships } from "./timetables";

/** A device explicitly opted into one forum. Endpoint is a capability: never log it. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    membershipId: uuid()
      .notNull()
      .references(() => timetableMemberships.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    lastCheckedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("push_membership_endpoint").on(
      table.membershipId,
      table.endpoint,
    ),
  ],
);
