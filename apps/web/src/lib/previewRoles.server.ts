import { cookies } from "next/headers";

import type { Role } from "@timetable/shared";

import { displayRoles, PREVIEW_COOKIE } from "./previewRoles";

/**
 * Roles to use for rendering, honoring the preview-as-elector cookie.
 * Rendering only — every query and mutation still runs with the real session.
 */
export async function displayRolesFromCookies(
  roles: readonly Role[],
): Promise<Role[]> {
  const on = (await cookies()).get(PREVIEW_COOKIE)?.value === "1";
  return displayRoles(roles, on);
}
