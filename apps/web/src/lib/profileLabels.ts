import { isProfilePublic, type Privacy, type Role } from "@timetable/shared";

/** Contact Details (2026-09-30): the members-only part of a profile, above
 * it everywhere. Its audience never varies, so neither does its line. */
export const CONTACT_DETAILS_AUDIENCE =
  "Only members of this forum can see these.";

/** The line under the About field: who actually reads the bio here —
 * the internet only where `isProfilePublic` says so (public/no_comments;
 * hosts and admins on hosts_only), forum members otherwise. */
export function profileAudience(privacy: string, roles: string[]): string {
  return isProfilePublic(privacy as Privacy, roles as Role[])
    ? "Anyone can see this, including search engines."
    : "Only members of this forum can see this.";
}
