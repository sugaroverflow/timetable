-- Mint member slugs for memberships that predate per-forum profiles.
-- Migration 0018 copied membership slugs from the old global users.slug, so
-- members whose account never had one came through NULL — which breaks their
-- topic permalinks (topicPath returns null; titles render as bare text).
-- Mirrors core's ensureMemberSlug: slugify(name, 'user'), reserved-segment
-- guard, "-2"/"-3"… on collision within the timetable.
DO $$
DECLARE
  m record;
  base text;
  candidate text;
  n int;
BEGIN
  FOR m IN
    SELECT id, timetable_id, name
    FROM timetable_memberships
    WHERE slug IS NULL
    ORDER BY created_at, id
  LOOP
    base := trim(both '-' from regexp_replace(lower(coalesce(m.name, '')), '[^a-z0-9]+', '-', 'g'));
    base := trim(trailing '-' from left(base, 60));
    IF base = '' THEN
      base := 'user';
    END IF;
    IF base IN ('feed','topics','calendar','dashboard','analysis','moderation','activity','settings','people','users','my-topics','api','sign-in','sign-up') THEN
      base := base || '-u';
    END IF;
    n := 1;
    LOOP
      candidate := base || CASE WHEN n > 1 THEN '-' || n::text ELSE '' END;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM timetable_memberships x
        WHERE x.timetable_id = m.timetable_id AND x.slug = candidate
      );
      n := n + 1;
    END LOOP;
    UPDATE timetable_memberships
    SET slug = candidate, updated_at = now()
    WHERE id = m.id;
  END LOOP;
END $$;
