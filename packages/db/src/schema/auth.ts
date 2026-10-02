import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { NotificationSettings, TokenScope } from "@timetable/shared";

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

/**
 * Personal API tokens: long-lived credentials a member creates for scripts and
 * external clients, since a Clerk session token lives ~60 seconds. Only the
 * SHA-256 of the secret is stored — the plaintext is shown once at creation
 * and is unrecoverable afterwards.
 *
 * `scopes` is `text[]` rather than a pg enum array deliberately: the scope
 * list grows, and adding an enum value here forces a full enum-recreation
 * migration (see the ALTER TYPE gotcha in CLAUDE.md). The canonical list and
 * its validator live in @timetable/shared; unrecognised stored values are
 * filtered out on read, so a removed scope can never widen a token.
 */
export const apiTokens = pgTable(
  "api_token",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Member-supplied label, shown in the token list. */
    name: text().notNull(),
    /** SHA-256 hex of the presented secret. Unique so a lookup is one probe. */
    tokenHash: text().notNull().unique(),
    /** First 8 characters of the secret — lets the UI and support identify a
     * row without holding anything that can authenticate. */
    prefix: text().notNull(),
    scopes: text().$type<TokenScope[]>().array().notNull().default([]),
    /** Touched on use, so members can spot tokens they've stopped needing. */
    lastUsedAt: timestamp({ withTimezone: true }),
    /** Null = never expires. */
    expiresAt: timestamp({ withTimezone: true }),
    /** Set instead of deleting the row, so a revoked secret can never be
     * re-created by chance and the audit trail survives. */
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_token_user_idx").on(t.userId)],
);
