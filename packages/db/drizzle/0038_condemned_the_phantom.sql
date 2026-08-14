-- Confirm-time locations (2026-08-14): confirmed sessions are exclusive per
-- (slot, location). Dedupe rows the old model legally allowed (two confirmed
-- sessions sharing a slot+non-empty location) before the unique lands.
-- Survivor per group: earliest created, then smallest id.
DELETE FROM "slot_sessions" a USING "slot_sessions" b
  WHERE a."slot_id" = b."slot_id" AND a."location" = b."location"
    AND a."status" = 'confirmed' AND b."status" = 'confirmed'
    AND a."location" <> '' AND a."id" <> b."id"
    AND (b."created_at" < a."created_at"
      OR (b."created_at" = a."created_at" AND b."id" < a."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "slot_sessions_slot_confirmed_location_uq" ON "slot_sessions" USING btree ("slot_id","location") WHERE "slot_sessions"."status" = 'confirmed' and "slot_sessions"."location" <> '';
