import {
  getPerson,
  getReadableTimetable,
  getViewerRoles,
  type ReadableTimetable,
} from "@timetable/core";
import { isAdmin, type Role, type Viewer } from "@timetable/shared";

import { getUserFromRequest, type SessionUser } from "./auth/clerk";

type Impersonation = {
  /** The real signed-in admin driving the preview. */
  actorId: string;
  timetableId: string;
};

export type ApiContext = {
  user: SessionUser | null;
  /** Set while an admin previews a timetable as another member (QA #59
   * round 3): `user` is the preview target for reads; every GraphQL
   * mutation is blocked while this is set. */
  impersonation: Impersonation | null;
  /** Resolve the acting viewer (roles) within a specific timetable. */
  getViewer(timetableId: string): Promise<Viewer>;
  /** Request-scoped memo over getReadableTimetable — several top-level
   * resolvers in one GraphQL document resolve the same timetable (timetable,
   * myFeedLastSeenAt, timetableHosts, topicFeed). Keyed by idOrSlug; the
   * user is fixed for the request. Optional so hand-built contexts (tests)
   * fall back to direct calls. Used by the GraphQL schema only — REST
   * handlers keep calling getReadableTimetable directly. */
  readableTimetable?(idOrSlug: string): Promise<ReadableTimetable | null>;
};

/**
 * Resolve the `x-view-as: <idOrSlug>:<userId>` preview header. The cookie
 * that feeds it grants nothing by itself — the ACTUAL user must be an admin
 * of that timetable on every request, and the target must be a member.
 * Only the GraphQL path passes the header through; REST always acts as the
 * real user.
 */
async function resolveImpersonation(
  actual: SessionUser,
  header: string,
): Promise<{ user: SessionUser; impersonation: Impersonation } | null> {
  const splitAt = header.indexOf(":");
  if (splitAt <= 0) return null;
  const idOrSlug = header.slice(0, splitAt);
  const targetId = header.slice(splitAt + 1);
  if (!targetId || targetId === actual.id) return null;

  const readable = await getReadableTimetable(actual.id, idOrSlug);
  if (!readable || !isAdmin(readable.roles as Role[])) return null;

  // getPerson joins the membership table — non-members can't be previewed.
  const target = await getPerson(readable.timetable.id, targetId);
  if (!target) return null;

  return {
    user: {
      id: target.userId,
      email: null, // never expose the target's email through preview
      name: target.name,
      image: target.image,
      bio: target.bio,
    },
    impersonation: {
      actorId: actual.id,
      timetableId: readable.timetable.id,
    },
  };
}

export async function buildContext(args: {
  authHeader?: string | null;
  cookieHeader?: string | null;
  viewAsHeader?: string | null;
}): Promise<ApiContext> {
  const actual = await getUserFromRequest(args.authHeader, args.cookieHeader);

  let user = actual;
  let impersonation: Impersonation | null = null;
  if (actual && args.viewAsHeader) {
    const resolved = await resolveImpersonation(actual, args.viewAsHeader);
    if (resolved) {
      user = resolved.user;
      impersonation = resolved.impersonation;
    }
  }

  // Caveat: within a single multi-mutation document, a role-changing
  // mutation won't invalidate the memo (acceptable — mutations that change
  // roles don't re-read them today).
  const readableCache = new Map<string, Promise<ReadableTimetable | null>>();

  return {
    user,
    impersonation,
    async getViewer(timetableId: string): Promise<Viewer> {
      const roles = await getViewerRoles(user?.id ?? null, timetableId);
      return { userId: user?.id ?? null, roles };
    },
    readableTimetable(idOrSlug: string): Promise<ReadableTimetable | null> {
      let promise = readableCache.get(idOrSlug);
      if (!promise) {
        promise = getReadableTimetable(user?.id ?? null, idOrSlug);
        readableCache.set(idOrSlug, promise);
      }
      return promise;
    },
  };
}
