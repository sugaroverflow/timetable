CREATE TABLE "slot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"topic_id" uuid,
	"session_host_id" text,
	"custom_title" text DEFAULT '' NOT NULL,
	"status" "slot_status" DEFAULT 'proposed' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slot_sessions" ADD CONSTRAINT "slot_sessions_slot_id_timeslots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."timeslots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_sessions" ADD CONSTRAINT "slot_sessions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_sessions" ADD CONSTRAINT "slot_sessions_session_host_id_user_id_fk" FOREIGN KEY ("session_host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_sessions" ADD CONSTRAINT "slot_sessions_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Bookings model data migration (2026-08-06): the old timeslots rows were
-- (time x location) units carrying at most one session. Each slot that
-- carried a session becomes a slot_sessions row (with that slot's
-- location); then slots sharing (forum, start, end) merge into one pure
-- time window — the earliest-created row is the keeper — and bookings,
-- availability answers, and discussion comments repoint to it.
INSERT INTO "slot_sessions" ("slot_id","location","topic_id","session_host_id","status","url","created_by_id","created_at","updated_at")
SELECT "id","location","topic_id","session_host_id","status","url","created_by_id","created_at","updated_at"
FROM "timeslots"
WHERE "status" <> 'empty' OR "topic_id" IS NOT NULL OR "session_host_id" IS NOT NULL;
--> statement-breakpoint
WITH k AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "timetable_id","starts_at","ends_at" ORDER BY "created_at","id") AS "keeper"
  FROM "timeslots"
)
UPDATE "slot_sessions" s SET "slot_id" = k."keeper" FROM k WHERE s."slot_id" = k."id" AND k."id" <> k."keeper";
--> statement-breakpoint
-- Same time + same location can only hold one booking (the old model
-- allowed duplicate slots there): keep the most recently updated.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "slot_id","location" ORDER BY "updated_at" DESC, "id" DESC) AS rn
  FROM "slot_sessions"
)
DELETE FROM "slot_sessions" WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);
--> statement-breakpoint
-- Availability is location-independent now: each user's LATEST answer
-- across a merged group survives, wherever it was recorded.
WITH k AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "timetable_id","starts_at","ends_at" ORDER BY "created_at","id") AS "keeper"
  FROM "timeslots"
), ranked AS (
  SELECT a."id", row_number() OVER (PARTITION BY k."keeper", a."user_id" ORDER BY a."updated_at" DESC, a."id" DESC) AS rn
  FROM "availability" a JOIN k ON k."id" = a."slot_id"
)
DELETE FROM "availability" WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);
--> statement-breakpoint
WITH k AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "timetable_id","starts_at","ends_at" ORDER BY "created_at","id") AS "keeper"
  FROM "timeslots"
)
UPDATE "availability" a SET "slot_id" = k."keeper" FROM k WHERE a."slot_id" = k."id" AND k."id" <> k."keeper";
--> statement-breakpoint
-- Discussion threads merge into the keeper's (per-timeslot threads).
WITH k AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "timetable_id","starts_at","ends_at" ORDER BY "created_at","id") AS "keeper"
  FROM "timeslots"
)
UPDATE "slot_comments" c SET "slot_id" = k."keeper" FROM k WHERE c."slot_id" = k."id" AND k."id" <> k."keeper";
--> statement-breakpoint
WITH k AS (
  SELECT "id", first_value("id") OVER (PARTITION BY "timetable_id","starts_at","ends_at" ORDER BY "created_at","id") AS "keeper"
  FROM "timeslots"
)
DELETE FROM "timeslots" WHERE "id" IN (SELECT "id" FROM k WHERE "id" <> "keeper");
--> statement-breakpoint
ALTER TABLE "timeslots" DROP CONSTRAINT "timeslots_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "timeslots" DROP CONSTRAINT "timeslots_session_host_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "timeslots" DROP COLUMN "location";--> statement-breakpoint
ALTER TABLE "timeslots" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "timeslots" DROP COLUMN "topic_id";--> statement-breakpoint
ALTER TABLE "timeslots" DROP COLUMN "session_host_id";--> statement-breakpoint
ALTER TABLE "timeslots" DROP COLUMN "url";--> statement-breakpoint
CREATE UNIQUE INDEX "slot_sessions_slot_location_uq" ON "slot_sessions" USING btree ("slot_id","location");--> statement-breakpoint
CREATE UNIQUE INDEX "timeslots_timetable_time_uq" ON "timeslots" USING btree ("timetable_id","starts_at","ends_at");
