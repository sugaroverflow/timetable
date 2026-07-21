import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { NotificationSettings } from "@timetable/shared";

/** Per-user digest/notification preferences — defined in @timetable/shared,
 * re-exported here for schema consumers. */
export type { NotificationSettings };

/**
 * Local user record. Authentication is handled by Clerk; `id` is the Clerk
 * user id, and this row mirrors profile fields so domain tables can hold
 * foreign keys without calling Clerk. Created/updated on sign-in by the API.
 *
 * `bio` is the "about" text; `image` is the profile picture URL.
 */
export const users = pgTable("user", {
  id: text().primaryKey(),
  name: text(),
  email: text().unique(),
  emailVerified: timestamp({ withTimezone: true }),
  image: text(),
  /** URL slug (globally unique, from the display name). Cosmetic segment in
   * topic permalinks — resolution is by topic slug, so renames are safe. */
  slug: text().unique(),
  bio: text(),
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
