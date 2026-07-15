-- Draft removed (product feedback round 1): existing drafts become
-- "submitted" (the new created/publishable state) before the enum drops the
-- value, otherwise the cast on the final statement would fail.
UPDATE "topics" SET "status" = 'submitted' WHERE "status" = 'draft';--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "status" SET DEFAULT 'submitted'::text;--> statement-breakpoint
DROP TYPE "public"."topic_status";--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('submitted', 'published', 'unpublished', 'archived');--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "status" SET DEFAULT 'submitted'::"public"."topic_status";--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "status" SET DATA TYPE "public"."topic_status" USING "status"::"public"."topic_status";