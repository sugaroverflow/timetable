/** Person-page link: /f/{timetable}/{member}. Prefers the member's slug;
 * a userId works too — the person page canonically redirects id → slug —
 * so callers with only an id still get a working link. */
export function personPath(
  timetableSlug: string,
  slugOrUserId: string,
): string {
  return `/f/${timetableSlug}/${slugOrUserId}`;
}
