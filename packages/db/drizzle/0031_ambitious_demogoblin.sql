ALTER TABLE "topics" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: everything currently awaiting moderation predates the ready
-- signal — treat it as ready so the admin queue does not silently empty
-- the day this ships. New topics start null (still drafting).
UPDATE "topics" SET "ready_at" = "updated_at" WHERE "status" = 'submitted';
