import type { Role } from "@timetable/shared";

/**
 * Roles to use for rendering. Since the view-as-user preview (QA #59
 * round 3), impersonation happens API-side: queries already return the
 * preview target's roles and data, so this is a pass-through. Kept so
 * page-level call sites read as "roles for display".
 */
export async function displayRolesFromCookies(
  roles: readonly Role[],
): Promise<Role[]> {
  return [...roles];
}
