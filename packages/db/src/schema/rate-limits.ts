import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Shared API rate-limit buckets for hosted multi-instance deployments. */
export const apiRateLimitBuckets = pgTable(
  "api_rate_limit_buckets",
  {
    bucketKey: text().primaryKey(),
    count: integer().notNull().default(0),
    resetAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_rate_limit_buckets_reset_idx").on(t.resetAt)],
);
