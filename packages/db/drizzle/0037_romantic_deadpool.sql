DROP INDEX "slot_sessions_slot_location_uq";--> statement-breakpoint
-- Pencils are location-less time-intents now (2026-08-14): dedupe rows the
-- old (slot, location) model legally allowed but the new uniques forbid.
-- Survivor per group: highest status (confirmed beats proposed), then
-- earliest created, then smallest id.
DELETE FROM "slot_sessions" a USING "slot_sessions" b
  WHERE a."slot_id" = b."slot_id" AND a."topic_id" = b."topic_id"
    AND a."topic_id" IS NOT NULL AND a."id" <> b."id"
    AND (b."status" > a."status"
      OR (b."status" = a."status" AND b."created_at" < a."created_at")
      OR (b."status" = a."status" AND b."created_at" = a."created_at" AND b."id" < a."id"));--> statement-breakpoint
DELETE FROM "slot_sessions" a USING "slot_sessions" b
  WHERE a."slot_id" = b."slot_id" AND a."session_host_id" = b."session_host_id"
    AND a."topic_id" IS NULL AND b."topic_id" IS NULL AND a."id" <> b."id"
    AND (b."status" > a."status"
      OR (b."status" = a."status" AND b."created_at" < a."created_at")
      OR (b."status" = a."status" AND b."created_at" = a."created_at" AND b."id" < a."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "slot_sessions_slot_topic_uq" ON "slot_sessions" USING btree ("slot_id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_sessions_slot_oh_host_uq" ON "slot_sessions" USING btree ("slot_id","session_host_id") WHERE "slot_sessions"."topic_id" is null;--> statement-breakpoint
CREATE INDEX "slot_sessions_slot_idx" ON "slot_sessions" USING btree ("slot_id");
