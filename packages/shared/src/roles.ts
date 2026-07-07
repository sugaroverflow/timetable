export const ROLES = ["owner", "admin", "host", "elector"] as const;
export type Role = (typeof ROLES)[number];

export const PRIVACY_LEVELS = [
  "deactivated",
  "private",
  "public",
  "hosts_only",
  "no_comments",
] as const;
export type Privacy = (typeof PRIVACY_LEVELS)[number];

/** Roles an admin is allowed to assign to others (not "owner"). */
export const ASSIGNABLE_ROLES = ["admin", "host", "elector"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const DEFAULT_ROLE_LABELS: Record<"admin" | "host" | "elector", string> =
  {
    admin: "Admin",
    host: "Host",
    elector: "Elector",
  };

export function hasRole(roles: readonly Role[], role: Role): boolean {
  return roles.includes(role);
}

export function isOwner(roles: readonly Role[]): boolean {
  return roles.includes("owner");
}

/** Owners are always admins. */
export function isAdmin(roles: readonly Role[]): boolean {
  return roles.includes("admin") || roles.includes("owner");
}

export function isHost(roles: readonly Role[]): boolean {
  return roles.includes("host");
}

export function isElector(roles: readonly Role[]): boolean {
  return roles.includes("elector");
}

/** True if the user has any membership role in the timetable. */
export function isMember(roles: readonly Role[]): boolean {
  return roles.length > 0;
}
