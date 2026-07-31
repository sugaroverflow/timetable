-- Calendar v2: slots carry ONE topic (simultaneous sessions are separate
-- slots), so the slot_topics m2m collapses into timeslots.topic_id. Carry
-- existing tags over first (earliest tag wins) as proposed sessions, then
-- drop the table.
UPDATE "timeslots" t
SET "topic_id" = st."topic_id",
    "status" = 'proposed'
FROM (
  SELECT DISTINCT ON ("slot_id") "slot_id", "topic_id"
  FROM "slot_topics"
  ORDER BY "slot_id", "created_at" ASC
) st
WHERE st."slot_id" = t."id" AND t."topic_id" IS NULL;--> statement-breakpoint
DROP TABLE "slot_topics" CASCADE;
