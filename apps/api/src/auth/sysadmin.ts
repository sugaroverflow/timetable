import { env } from "../env";

/** Pure check, unit-testable: is this email on the sysadmin list? */
export function isSysadminEmail(
  email: string | null | undefined,
  sysadminEmails: readonly string[],
): boolean {
  if (!email) return false;
  return sysadminEmails.includes(email.toLowerCase());
}

/** Whether this user is a global sysadmin (SYSADMIN_EMAILS env). */
export function isSysadmin(
  user: { email: string | null } | null | undefined,
): boolean {
  return isSysadminEmail(user?.email, env.sysadminEmails);
}
