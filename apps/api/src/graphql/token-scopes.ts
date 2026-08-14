import { getOperationAST, GraphQLError, Kind } from "graphql";
import type { Plugin } from "graphql-yoga";

import type { TokenScope } from "@timetable/shared";

import type { ApiContext } from "../context";
import { env } from "../env";
import {
  createDatabaseRateLimitStore,
  createMemoryRateLimitStore,
  rateLimitDecision,
  type RateLimitStore,
} from "../http/rate-limit";

/**
 * Which scope each mutation needs when the request is authenticated by a
 * personal API token. Enforcement is DEFAULT-DENY: a mutation absent from this
 * map is unreachable by any token, whatever scopes it holds.
 *
 * That is the point, not an oversight. Everything deliberately left out is
 * either an admin/moderation power (moderateTopic, unpublishTopic,
 * reassignTopic, hideComment, hideSlotComment, updateForumProfile,
 * updateForumSettings, setHeartsCountFrom, updateMemberBio, queueRestartRound,
 * the timeslot and slot-session admin mutations, startUserPreview /
 * stopUserPreview) or token administration itself (createApiToken,
 * revokeApiToken — so a leaked token can neither mint more tokens nor widen
 * its own scopes). Adding a key here is a deliberate decision to expose that
 * mutation to scripts; the omissions are the security boundary.
 *
 * Scopes are a ceiling, never a grant — the resolvers' own role checks
 * (canHeart, assertMayComment, canModerate…) still run, so a token can only
 * ever do a subset of what its owner could do in the app.
 */
export const MUTATION_SCOPES: Readonly<Record<string, TokenScope>> = {
  // hearts:write
  heartTopic: "hearts:write",
  hostHeartTopic: "hearts:write",

  // comments:write — the author's own comments, on topics and on timeslots.
  addComment: "comments:write",
  replyToComment: "comments:write",
  editComment: "comments:write",
  deleteComment: "comments:write",
  addSlotComment: "comments:write",
  updateSlotComment: "comments:write",
  deleteSlotComment: "comments:write",

  // topics:write — a host's own topics.
  createTopic: "topics:write",
  updateTopic: "topics:write",
  submitTopic: "topics:write",
  setTopicReady: "topics:write",
  deleteTopic: "topics:write",

  // calendar:write — the member's own availability, plus proposing a slot.
  setAvailability: "calendar:write",
  setMyAvailabilityPattern: "calendar:write",
  proposeSlot: "calendar:write",

  // feed:write — clearing the member's own unread state, including comment
  // threads and digest emails (a feed-triage token that can't mark comments
  // seen would leave its owner receiving digests for comments already read).
  queueMarkSeen: "feed:write",
  markFeedSeen: "feed:write",
  markNotificationsSeen: "feed:write",
  markCommentsSeen: "feed:write",
  markDigestRead: "feed:write",

  // profile:write — the member's own profile and notification preferences.
  updateMyProfile: "profile:write",
  updateMyNotificationSettings: "profile:write",
  updateMyForumDigestSettings: "profile:write",
};

function forbidScope(field: string, scope: TokenScope | undefined): never {
  const detail = scope
    ? `this token doesn't have the "${scope}" scope`
    : "personal API tokens can't call it at all";
  throw new GraphQLError(`Not allowed: ${field} — ${detail}.`, {
    extensions: { code: "FORBIDDEN", requiredScope: scope ?? null },
  });
}

/**
 * Hourly write budgets for token-authenticated requests, per token
 * (2026-08-14, the hardening pass adopting #273). Session traffic never
 * touches these — signed-in humans keep the per-user ACTION_LIMITS in
 * http/action-limits.ts, which token requests are ALSO subject to (those are
 * keyed by the owning user). Tune here.
 */
export const TOKEN_WRITE_WINDOW_MS = 60 * 60_000;

export const TOKEN_WRITE_LIMITS = {
  /** createTopic. */
  topics: 10,
  /** New comments: addComment, addSlotComment. */
  comments: 20,
  /** ❤️ toggles: heartTopic, hostHeartTopic. Deliberately far tighter than
   * the per-user 60/minute heart action limit — for tokens only. */
  hearts: 60,
  /** Every other mapped write mutation, sharing one bucket. */
  other: 60,
} as const;

export type TokenWriteBucket = keyof typeof TOKEN_WRITE_LIMITS;

/** Which budget a mapped mutation draws from; anything unlisted is `other`.
 * (Unmapped mutations never get this far — the scope plugin refused them.) */
const TOKEN_WRITE_BUCKETS: Readonly<Partial<Record<string, TokenWriteBucket>>> =
  {
    createTopic: "topics",
    addComment: "comments",
    addSlotComment: "comments",
    heartTopic: "hearts",
    hostHeartTopic: "hearts",
  };

export type TokenWriteLimiter = {
  check(
    tokenId: string,
    bucket: TokenWriteBucket,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};

export function createTokenWriteLimiter(
  injectedStore?: RateLimitStore,
): TokenWriteLimiter {
  let store = injectedStore;
  return {
    async check(tokenId, bucket) {
      // One store: every bucket shares TOKEN_WRITE_WINDOW_MS.
      store ??=
        env.rateLimitBackend === "database"
          ? createDatabaseRateLimitStore({
              windowMs: TOKEN_WRITE_WINDOW_MS,
              cleanupIntervalMs: env.rateLimitCleanupIntervalMs,
            })
          : createMemoryRateLimitStore(TOKEN_WRITE_WINDOW_MS);
      const now = Date.now();
      const hit = await store.hit(
        `${env.rateLimitKeyPrefix}:token-write:${bucket}:${tokenId}`,
        now,
      );
      return rateLimitDecision(hit, TOKEN_WRITE_LIMITS[bucket], now);
    },
  };
}

/**
 * Budget the write mutations a token-authenticated operation is about to run.
 *
 * Registered AFTER useApiTokenScopes in app.ts, so by the time this runs
 * every root selection is a plain field the token is allowed to call — this
 * plugin only meters them. Charged per field occurrence, before execution
 * (a failing resolver still spends budget — fine, the point is a ceiling on
 * automated write pressure, not an exact success count).
 */
export function useApiTokenWriteLimits(
  limiter: TokenWriteLimiter = createTokenWriteLimiter(),
): Plugin<ApiContext> {
  return {
    async onExecute({ args }) {
      const ctx = args.contextValue;
      if (!ctx.apiToken) return;

      const operation = getOperationAST(args.document, args.operationName);
      if (operation?.operation !== "mutation") return;

      for (const selection of operation.selectionSet.selections) {
        // The scope plugin already threw on non-field selections.
        if (selection.kind !== Kind.FIELD) return;
        const field = selection.name.value;
        if (field.startsWith("__")) continue;

        const bucket = TOKEN_WRITE_BUCKETS[field] ?? "other";
        const decision = await limiter.check(ctx.apiToken.id, bucket);
        if (!decision.allowed) {
          throw new GraphQLError(
            "Rate limit for automated writes reached — try later.",
            {
              extensions: {
                code: "RATE_LIMITED",
                retryAfterSeconds: decision.retryAfterSeconds,
              },
            },
          );
        }
      }
    },
  };
}

/**
 * Gate mutations by the authenticating token's scopes.
 *
 * Runs once per operation rather than per resolver, so no individual resolver
 * has to remember the check — and a mutation added later is denied to tokens
 * until someone deliberately maps it. Requests authenticated by a Clerk
 * session carry no `apiToken` and pass straight through.
 *
 * Modelled on the impersonation guard in app.ts: same `onExecute` hook, same
 * `getOperationAST` access to the document.
 */
export function useApiTokenScopes(): Plugin<ApiContext> {
  return {
    onExecute({ args }) {
      const ctx = args.contextValue;
      if (!ctx.apiToken) return;

      const operation = getOperationAST(args.document, args.operationName);
      if (operation?.operation !== "mutation") return;

      const granted = new Set<TokenScope>(ctx.apiToken.scopes);
      for (const selection of operation.selectionSet.selections) {
        // Mutations are always plain fields at the root; a fragment spread
        // there would hide the field name from this check, so refuse it
        // rather than guess.
        if (selection.kind !== Kind.FIELD) {
          throw new GraphQLError(
            "Not allowed: personal API tokens can't use fragments at the mutation root.",
            { extensions: { code: "FORBIDDEN" } },
          );
        }
        const field = selection.name.value;
        if (field.startsWith("__")) continue;
        const required = MUTATION_SCOPES[field];
        if (!required || !granted.has(required)) {
          forbidScope(field, required);
        }
      }
    },
  };
}
