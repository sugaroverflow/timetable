/**
 * "View timetable as [username]" (QA #59 round 3). The cookie carries
 * `<slug>:<userId>` and is path-scoped to /t/<slug>, so previewing one
 * timetable never affects another. It grants nothing by itself: the API
 * re-verifies on every request that the real user is an admin of that
 * timetable, resolves reads as the target member, and blocks all mutations
 * while the preview is active.
 */
export const VIEW_AS_COOKIE = "view-as-user";

export function viewAsCookieValue(slug: string, userId: string): string {
  return `${slug}:${userId}`;
}

/** Target userId when the cookie matches this timetable, else null. */
export function parseViewAs(
  value: string | undefined,
  slug: string,
): string | null {
  if (!value || !value.startsWith(`${slug}:`)) return null;
  return value.slice(slug.length + 1) || null;
}
