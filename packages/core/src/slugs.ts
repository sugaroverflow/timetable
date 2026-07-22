import { and, eq, isNull, ne } from "drizzle-orm";

import { db, topics, users } from "@timetable/db";
import { slugify } from "@timetable/shared";

/** Route segments under /t/[slug]/ that a user slug must never shadow —
 * the permalink route's [hostSlug] segment lives at the same level. */
const RESERVED_SEGMENTS = new Set([
  "feed",
  "topics",
  "calendar",
  "dashboard",
  "moderation",
  "activity",
  "settings",
  "people",
  "users",
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

/** Globally unique user slug from a display name, avoiding reserved route
 * segments. Cosmetic in permalinks, so regenerating on rename is safe. */
export async function ensureUserSlug(
  name: string | null,
  opts: { excludeUserId?: string } = {},
): Promise<string> {
  let base = slugify(name ?? "", "user");
  if (RESERVED_SEGMENTS.has(base)) base = `${base}-u`;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const conds = [eq(users.slug, candidate)];
    if (opts.excludeUserId) conds.push(ne(users.id, opts.excludeUserId));
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...conds))
      .limit(1);
    if (!taken) return candidate;
  }
}

/** Backstop for users created before slugs existed (or via paths that skip
 * slug assignment): generates and stores one on demand. */
export async function getOrCreateUserSlug(userId: string): Promise<string> {
  const [row] = await db
    .select({ slug: users.slug, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return userId;
  if (row.slug) return row.slug;
  const slug = await ensureUserSlug(row.name, { excludeUserId: userId });
  await db
    .update(users)
    .set({ slug })
    .where(and(eq(users.id, userId), isNull(users.slug)));
  return slug;
}
