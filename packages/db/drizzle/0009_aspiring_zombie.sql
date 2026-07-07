ALTER TABLE "timetables" ADD COLUMN "hearts_count_from" timestamp with time zone;--> statement-breakpoint
-- Archived hearts were "reset" votes under the old row-marking model; the
-- cutoff model has no equivalent row state, so drop them before the column.
DELETE FROM "hearts" WHERE "archived_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "hearts" DROP COLUMN "archived_at";