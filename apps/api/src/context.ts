import {
  getPerson,
  getReadableTimetable,
  getViewerRoles,
  type ReadableTimetable,
} from "@timetable/core";
import {
  isAdmin,
  type Role,
  type TokenScope,
  type Viewer,
} from "@timetable/shared";

import { extractApiToken, getUserFromApiToken } from "./auth/api-token";
import { getUserFromRequest, type SessionUser } from "./auth/clerk";
import { isSysadmin } from "./auth/sysadmin";
import { structuredLogger } from "./http/request-log";

type Impersonation = {
  /** The real signed-in admin driving the preview. */
  actorId: string;
  timetableId: string;
};

/** The personal API token the request authenticated with, when it did. Its
 * presence is what makes the scope check in graphql/token-scopes.ts apply —
 * session-authenticated requests leave this null and are unaffected. */
type ApiTokenAuth = {
  id: string;
  scopes: TokenScope[];
};

export type ApiContext = {
  user: SessionUser | null;
  /** Non-null only on requests authenticated by a personal API token. */
  apiToken: ApiTokenAuth | null;
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
  /**
   * Whether a personal API token may authenticate this request. ONLY the
   * GraphQL entry point passes true.
   *
   * Scope enforcement is a GraphQL plugin (graphql/token-scopes.ts), so it
   * cannot see REST requests. If REST accepted personal tokens, a token
   * scoped to nothing but `hearts:write` would arrive at
   * POST /api/forums/:id/invites, PATCH /api/memberships/:id/roles, and the
   * rest of the admin surface as a fully authenticated user — the scopes
   * would be decorative. Defaulting to false keeps that closed by
   * construction rather than by a guard every new REST route must remember.
   */
  allowApiToken?: boolean;
}): Promise<ApiContext> {
  const presentedToken = args.allowApiToken
    ? extractApiToken(args.authHeader)
    : null;
  if (presentedToken) {
    // A personal token acts as its owner, always: no impersonation preview
    // (x-view-as is ignored) and no cookie fallback.
    const identity = await getUserFromApiToken(presentedToken);
    return baseContext({
      user: identity?.user ?? null,
      apiToken: identity?.token ?? null,
      impersonation: null,
    });
  }

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

  return baseContext({ user, apiToken: null, impersonation });
}

/** The request-scoped viewer/memo machinery, shared by both credential
 * paths so they can't drift. */
function baseContext(args: {
  user: SessionUser | null;
  apiToken: ApiTokenAuth | null;
  impersonation: Impersonation | null;
}): ApiContext {
  const { user, apiToken, impersonation } = args;

  // Caveat: within a single multi-mutation document, a role-changing
  // mutation won't invalidate the memo (acceptable — mutations that change
  // roles don't re-read them today).
  const readableCache = new Map<string, Promise<ReadableTimetable | null>>();

  const sysadmin = isSysadmin(user);

  return {
    user,
    apiToken,
    impersonation,
    async getViewer(timetableId: string): Promise<Viewer> {
      const roles = await getViewerRoles(user?.id ?? null, timetableId);
      // The sysadmin flag unlocks READ checks only (see shared Viewer docs);
      // it never rides under an impersonation preview.
      return {
        userId: user?.id ?? null,
        roles,
        sysadmin: sysadmin && !impersonation,
      };
    },
    readableTimetable(idOrSlug: string): Promise<ReadableTimetable | null> {
      let promise = readableCache.get(idOrSlug);
      if (!promise) {
        promise = getReadableTimetable(user?.id ?? null, idOrSlug, {
          sysadmin: sysadmin && !impersonation,
        }).then((readable) => {
          // Operator oversight is accountable: reads of forums the member
          // roles alone wouldn't unlock leave a log line (2026-07-29).
          if (
            readable &&
            sysadmin &&
            !impersonation &&
            readable.roles.length === 0 &&
            ["private", "deactivated"].includes(readable.timetable.privacy)
          ) {
            structuredLogger("sysadmin").info(
              `${user?.email} read ${readable.timetable.privacy} forum "${readable.timetable.slug}" via operator access`,
            );
          }
          return readable;
        });
        readableCache.set(idOrSlug, promise);
      }
      return promise;
    },
  };
}
