ALTER TABLE "user" ADD COLUMN "last_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ics_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_icsToken_unique" UNIQUE("ics_token");