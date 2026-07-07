/** Canonical topic permalink: /t/{timetable}/{host}/{topic}. Topics belong
 * to hosts, so the owner appears in the path; resolution is by topic slug
 * alone, and the route canonical-redirects stale host segments. Returns
 * null when slugs are missing (legacy rows). */
export function topicPath(
  timetableSlug: string,
  hostSlug: string | null | undefined,
  topicSlug: string | null | undefined,
): string | null {
  if (!hostSlug || !topicSlug) return null;
  return `/t/${timetableSlug}/${hostSlug}/${topicSlug}`;
}
