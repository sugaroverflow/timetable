ALTER TABLE "timeslots" ADD COLUMN "locations" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Backfill: a legacy slot offers the locations its bookings already use.
UPDATE "timeslots" SET "locations" = s."locs"
FROM (
  SELECT "slot_id", array_agg(DISTINCT "location" ORDER BY "location") AS "locs"
  FROM "slot_sessions"
  WHERE "location" <> ''
  GROUP BY "slot_id"
) s
WHERE s."slot_id" = "timeslots"."id";