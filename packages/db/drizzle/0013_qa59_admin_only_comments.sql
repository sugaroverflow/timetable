-- QA #59 round 3: admin_only comment visibility. Recreate the enum instead
-- of ALTER TYPE ... ADD VALUE so the new value is usable inside the same
-- migration transaction (Postgres forbids using a just-added enum value in
-- the transaction that added it).
ALTER TYPE "public"."comment_visibility" RENAME TO "comment_visibility_old";--> statement-breakpoint
CREATE TYPE "public"."comment_visibility" AS ENUM('public', 'host_only', 'admin_only');--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "visibility" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "visibility" TYPE "public"."comment_visibility" USING "visibility"::text::"public"."comment_visibility";--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "visibility" SET DEFAULT 'public';--> statement-breakpoint
DROP TYPE "public"."comment_visibility_old";
