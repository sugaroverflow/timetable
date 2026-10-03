import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

/** Web Push (docs/web-push-plan.md, #368): one row per DEVICE a user has
 * switched alerts on for. Keyed to the user, not a membership — turning
 * alerts on on a phone covers every forum on that phone; which kinds alert
 * is per forum, in `timetable_memberships.digest_settings.push`.
 *
 * `endpoint`, `p256dh` and `auth` together let someone show arbitrary text
 * on the device: as sensitive as the VAPID private key, never logged. The
 * endpoint is unique — one browser subscription belongs to one account at a
 * time (core `subscribePush` refuses to move it silently). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    /** The browser's ECDH P-256 public key, base64url (RFC 8291). */
    p256dh: text().notNull(),
    /** The browser's 16-byte auth secret, base64url (RFC 8291). */
    auth: text().notNull(),
    /** Short device label the client supplies ("Chrome on Android"), so a
     * device list can tell phones apart. Optional; never the raw UA. */
    label: text(),
    /** Events from before this never alert on this device. */
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Last accepted send. */
    lastSentAt: timestamp({ withTimezone: true }),
    /** Consecutive 429/5xx failures; reset on success, row deleted at 20. */
    failureCount: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

/** The push sweep's cursor (plan §3.2): exactly one row (`id = 1`, seeded
 * by the migration). Each once-a-minute run claims `(swept_until, to]` by
 * compare-and-set on `swept_until`, so every window belongs to one run. */
export const pushSweepState = pgTable(
  "push_sweep_state",
  {
    id: smallint().primaryKey().default(1),
    sweptUntil: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("push_sweep_state_one_row", sql`${t.id} = 1`)],
);
