import { isProfilePublic, type Privacy, type Role } from "@timetable/shared";

/** Contact Details (2026-09-30): the members-only part of a profile, above
 * it everywhere. Its audience never varies, so neither does its line. */
export const CONTACT_DETAILS_AUDIENCE =
  "Only members of this forum can see these.";

/** "Public Profile" only when the internet really can read it; plain
 * "Profile" on private forums and for electors on hosts-only ones (Ed,
 * 2026-09-30 — the label must never claim a reach it doesn't have). */
export function profileHeading(privacy: string, roles: string[]): string {
  return isProfilePublic(privacy as Privacy, roles as Role[])
    ? "Public Profile"
    : "Profile";
}

/** The line under the profile heading: who actually sees it here. */
export function profileAudience(privacy: string, roles: string[]): string {
  return isProfilePublic(privacy as Privacy, roles as Role[])
    ? "Anyone can see this, including search engines."
    : "Only members of this forum can see this.";
}
