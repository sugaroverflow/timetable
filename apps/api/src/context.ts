import { getViewerRoles } from "@timetable/core";
import type { Viewer } from "@timetable/shared";

import { getUserFromRequest, type SessionUser } from "./auth/clerk";

export type ApiContext = {
  user: SessionUser | null;
  /** Resolve the acting viewer (roles) within a specific timetable. */
  getViewer(timetableId: string): Promise<Viewer>;
};

export async function buildContext(args: {
  authHeader?: string | null;
  cookieHeader?: string | null;
}): Promise<ApiContext> {
  const user = await getUserFromRequest(args.authHeader, args.cookieHeader);
  return {
    user,
    async getViewer(timetableId: string): Promise<Viewer> {
      const roles = await getViewerRoles(user?.id ?? null, timetableId);
      return { userId: user?.id ?? null, roles };
    },
  };
}
