import { getViewerRoles } from "@timetable/core";
import type { Viewer } from "@timetable/shared";

import { getUserFromCookieHeader, type SessionUser } from "./auth/session";

export type ApiContext = {
  user: SessionUser | null;
  /** Resolve the acting viewer (roles) within a specific timetable. */
  getViewer(timetableId: string): Promise<Viewer>;
};

export async function buildContext(
  cookieHeader?: string | null,
): Promise<ApiContext> {
  const user = await getUserFromCookieHeader(cookieHeader);
  return {
    user,
    async getViewer(timetableId: string): Promise<Viewer> {
      const roles = await getViewerRoles(user?.id ?? null, timetableId);
      return { userId: user?.id ?? null, roles };
    },
  };
}
