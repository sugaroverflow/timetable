/**
 * URL-safe slug from arbitrary text (timetable names, topic titles, user
 * display names). Lowercases, collapses runs of non-alphanumerics to single
 * hyphens, strips leading/trailing hyphens, and truncates to 60 chars
 * without leaving a dangling hyphen. Returns `fallback` when nothing
 * slug-worthy remains.
 */
export function slugify(value: string, fallback = "timetable"): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || fallback;
}

/** Append a short random suffix to keep slugs unique on collision. */
export function withRandomSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slug}-${suffix}`;
}
