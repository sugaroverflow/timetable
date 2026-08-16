import { and, eq, like, ne, or } from "drizzle-orm";

import { db, timetableMemberships, topics } from "@timetable/db";
import { slugify } from "@timetable/shared";

/** Route segments under /f/[slug]/ that a user slug must never shadow —
 * the permalink route's [hostSlug] segment lives at the same level. */
const RESERVED_SEGMENTS = new Set([
  "feed",
  "topics",
  "calendar",
  "dashboard",
  "analysis",
  "moderation",
  "activity",
  "settings",
  "people",
  "users",
  "my-topics",
  "api",
  "sign-in",
  "sign-up",
]);

/** Smallest free candidate from base, base-2, base-3, … given the set of
 * taken slugs. One query feeds this instead of one query per candidate
 * (a forum with 40 "Untitled" topics used to cost 40 round-trips per
 * create — audit 2026-08-17). Two concurrent creates can still pick the
 * same candidate; the per-timetable unique index is the backstop. */
function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** slugify output is [a-z0-9-] only, so `base` needs no LIKE escaping. */
function slugFamily(base: string) {
  return `${base}-%`;
}

/** Unique-per-timetable topic slug from a title ("-2", "-3"… on collision). */
export async function ensureTopicSlug(
  timetableId: string,
  title: string,
  opts: { excludeTopicId?: string } = {},
): Promise<string> {
  const base = slugify(title, "topic");
  const conds = [
    eq(topics.timetableId, timetableId),
    or(eq(topics.slug, base), like(topics.slug, slugFamily(base))),
  ];
  if (opts.excludeTopicId) conds.push(ne(topics.id, opts.excludeTopicId));
  const rows = await db
    .select({ slug: topics.slug })
    .from(topics)
    .where(and(...conds));
  return nextFreeSlug(
    base,
    new Set(rows.map((r) => r.slug).filter((s): s is string => s != null)),
  );
}

/** Unique-per-timetable member slug from a display name, avoiding reserved
 * route segments. Person pages (/f/[slug]/[userSlug]) resolve by this;
 * in topic permalinks it stays cosmetic (stale segments 301). */
export async function ensureMemberSlug(
  timetableId: string,
  name: string | null,
  opts: { excludeMembershipId?: string } = {},
): Promise<string> {
  let base = slugify(name ?? "", "user");
  if (RESERVED_SEGMENTS.has(base)) base = `${base}-u`;
  const conds = [
    eq(timetableMemberships.timetableId, timetableId),
    or(
      eq(timetableMemberships.slug, base),
      like(timetableMemberships.slug, slugFamily(base)),
    ),
  ];
  if (opts.excludeMembershipId) {
    conds.push(ne(timetableMemberships.id, opts.excludeMembershipId));
  }
  const rows = await db
    .select({ slug: timetableMemberships.slug })
    .from(timetableMemberships)
    .where(and(...conds));
  return nextFreeSlug(
    base,
    new Set(rows.map((r) => r.slug).filter((s): s is string => s != null)),
  );
}
