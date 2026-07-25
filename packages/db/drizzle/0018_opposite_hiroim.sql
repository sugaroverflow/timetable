ALTER TABLE "timetable_memberships" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "timetable_memberships" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "timetable_memberships" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "timetable_memberships" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill per-forum profiles from the (previously global) user profile.
-- users.slug was globally unique, so the per-timetable copies are unique
-- within each timetable and the index below creates cleanly.
UPDATE "timetable_memberships" m
SET "name" = u."name",
    "image" = u."image",
    "bio" = u."bio",
    "slug" = u."slug"
FROM "user" u
WHERE u."id" = m."user_id";--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_timetable_slug_uq" ON "timetable_memberships" USING btree ("timetable_id","slug");