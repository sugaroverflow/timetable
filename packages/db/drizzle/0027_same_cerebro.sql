ALTER TABLE "timeslots" ADD COLUMN "session_host_id" text;--> statement-breakpoint
ALTER TABLE "timeslots" ADD CONSTRAINT "timeslots_session_host_id_user_id_fk" FOREIGN KEY ("session_host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: existing topic sessions are owned by their topic's host.
UPDATE "timeslots" t
SET "session_host_id" = tp."host_id"
FROM "topics" tp
WHERE tp."id" = t."topic_id" AND t."topic_id" IS NOT NULL;
