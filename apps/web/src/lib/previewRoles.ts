import type { Role } from "@timetable/shared";

export const PREVIEW_COOKIE = "preview-as-elector";

/**
 * UI-only role reduction for the "preview as elector" mode. Pages use the
 * returned roles for what they RENDER; server authorization is untouched, so
 * host/admin-only data and mutations stay gated server-side regardless.
 * Members without a host/admin role are unaffected.
 *
 * Privileged members preview as ["elector"] even when they don't hold the
 * elector role themselves — the point of the toggle is to see the elector
 * layout. Mutations an actual non-elector can't perform still fail
 * server-side with an error toast.
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
  return ["elector"];
}
