import type { Role } from "@timetable/shared";

export const PREVIEW_COOKIE = "preview-as-elector";

/**
 * UI-only role reduction for the "preview as elector" mode. Pages use the
 * returned roles for what they RENDER; server authorization is untouched, so
 * this can only ever hide UI, never widen access. Members without a
 * host/admin role are unaffected.
 */
export function displayRoles(
  roles: readonly Role[],
  previewOn: boolean,
): Role[] {
  if (!previewOn) return [...roles];
  const privileged = roles.some(
    (r) => r === "host" || r === "admin" || r === "owner",
  );
  if (!privileged) return [...roles];
  return roles.filter((r) => r === "elector");
}
