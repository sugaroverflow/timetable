import { and, eq, ne } from "drizzle-orm";

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

/** Unique-per-timetable topic slug from a title ("-2", "-3"… on collision). */
export async function ensureTopicSlug(
  timetableId: string,
  title: string,
  opts: { excludeTopicId?: string } = {},
): Promise<string> {
  const base = slugify(title, "topic");
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const conds = [
      eq(topics.timetableId, timetableId),
      eq(topics.slug, candidate),
    ];
    if (opts.excludeTopicId) conds.push(ne(topics.id, opts.excludeTopicId));
    const [taken] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(...conds))
      .limit(1);
    if (!taken) return candidate;
  }
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
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const conds = [
      eq(timetableMemberships.timetableId, timetableId),
      eq(timetableMemberships.slug, candidate),
    ];
    if (opts.excludeMembershipId) {
      conds.push(ne(timetableMemberships.id, opts.excludeMembershipId));
    }
    const [taken] = await db
      .select({ id: timetableMemberships.id })
      .from(timetableMemberships)
      .where(and(...conds))
      .limit(1);
    if (!taken) return candidate;
  }
}
