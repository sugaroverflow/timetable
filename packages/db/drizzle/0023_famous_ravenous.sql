ALTER TABLE "comments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "edited_at" timestamp with time zone;