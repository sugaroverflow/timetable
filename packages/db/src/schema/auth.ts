import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { NotificationSettings } from "@timetable/shared";

/** Per-user digest/notification preferences — defined in @timetable/shared,
 * re-exported here for schema consumers. */
export type { NotificationSettings };

/**
 * Local user record. Authentication is handled by Clerk; `id` is the Clerk
 * user id, and this row mirrors profile fields so domain tables can hold
 * foreign keys without calling Clerk. Created/updated on sign-in by the API.
 * Public profile (name/photo/bio/slug) lives per-forum on the membership.
 */
export const users = pgTable("user", {
  id: text().primaryKey(),
  name: text(),
  email: text().unique(),
  emailVerified: timestamp({ withTimezone: true }),
  image: text(),
  notificationSettings: jsonb()
    .$type<NotificationSettings>()
    .notNull()
    .default({}),
  /** When the last email digest was sent (for computing deltas). */
  lastDigestAt: timestamp({ withTimezone: true }),
  /** Secret token for subscribing to the ICS calendar feed. */
  icsToken: text()
    .unique()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
