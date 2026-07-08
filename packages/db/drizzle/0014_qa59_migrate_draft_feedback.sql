-- QA #59 round 3: the drafting-process feedback thread moves from
-- host_only to the new admin_only visibility. host_only comments on
-- published topics are the Faculty-only thread and stay as they are.
UPDATE "comments"
SET "visibility" = 'admin_only'
WHERE "visibility" = 'host_only'
  AND "topic_id" IN (
    SELECT "id" FROM "topics" WHERE "status" IN ('draft', 'submitted')
  );
