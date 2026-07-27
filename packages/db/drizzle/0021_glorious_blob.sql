ALTER TABLE "user" DROP CONSTRAINT "user_slug_unique";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "bio";