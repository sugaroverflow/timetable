ALTER TABLE "user" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "topics_timetable_slug_uq" ON "topics" USING btree ("timetable_id","slug");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_slug_unique" UNIQUE("slug");--> statement-breakpoint
WITH base AS (
  SELECT id, timetable_id, created_at,
    CASE WHEN trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) = ''
      THEN 'topic'
      ELSE left(trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')), 60)
    END AS b
  FROM topics WHERE slug IS NULL
), numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY timetable_id, b ORDER BY created_at, id) AS rn
  FROM base
)
UPDATE topics t SET slug = n.b || CASE WHEN n.rn > 1 THEN '-' || n.rn::text ELSE '' END
FROM numbered n WHERE t.id = n.id;--> statement-breakpoint
WITH base AS (
  SELECT id, created_at,
    CASE WHEN trim(both '-' from regexp_replace(lower(coalesce(nullif(name, ''), 'user')), '[^a-z0-9]+', '-', 'g')) = ''
      THEN 'user'
      ELSE left(trim(both '-' from regexp_replace(lower(coalesce(nullif(name, ''), 'user')), '[^a-z0-9]+', '-', 'g')), 40)
    END AS raw
  FROM "user" WHERE slug IS NULL
), guarded AS (
  SELECT id, created_at,
    CASE WHEN raw IN ('feed','topics','calendar','dashboard','moderation','activity','settings','people','users','api','sign-in','sign-up')
      THEN raw || '-u' ELSE raw END AS b
  FROM base
), numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY created_at, id) AS rn
  FROM guarded
)
UPDATE "user" u SET slug = n.b || CASE WHEN n.rn > 1 THEN '-' || n.rn::text ELSE '' END
FROM numbered n WHERE u.id = n.id;
