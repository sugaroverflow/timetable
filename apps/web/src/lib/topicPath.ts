/** Canonical topic permalink: /f/{timetable}/{host}/{topic}. Topics belong
 * to hosts, so the owner appears in the path; resolution is by topic slug
 * alone, and the route canonical-redirects stale host segments — so when
 * the host has no member slug (left the forum, or a pre-profile row the
 * 0019 backfill missed), callers can pass hostId as a working stand-in.
 * Returns null when the topic slug (or both host identifiers) is missing. */
export function topicPath(
  timetableSlug: string,
  hostSlug: string | null | undefined,
  topicSlug: string | null | undefined,
  hostId?: string | null,
): string | null {
  const host = hostSlug || hostId;
  if (!host || !topicSlug) return null;
  return `/f/${timetableSlug}/${host}/${topicSlug}`;
}
