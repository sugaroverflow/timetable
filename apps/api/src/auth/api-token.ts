import { GraphQLError } from "graphql";

import {
  API_TOKEN_PREFIX,
  findActiveApiToken,
  hashApiToken,
  touchApiToken,
} from "@timetable/core";
import type { TokenScope } from "@timetable/shared";

import { env } from "../env";
import {
  createDatabaseRateLimitStore,
  createMemoryRateLimitStore,
  rateLimitDecision,
  type RateLimitStore,
} from "../http/rate-limit";
import { structuredLogger } from "../http/request-log";

import type { SessionUser } from "./clerk";

/** The credential a personal token resolves to: the same user shape a Clerk
 * session produces, plus the token's identity and scopes so the GraphQL layer
 * can gate mutations. */
export type ApiTokenIdentity = {
  user: SessionUser;
  token: { id: string; scopes: TokenScope[] };
};

/**
 * True for a bearer value that is one of our personal tokens rather than a
 * Clerk session JWT. Cheap and unambiguous — Clerk JWTs are three
 * base64url segments joined by dots and never carry this prefix.
 */
export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(API_TOKEN_PREFIX);
}

/** Pull a personal token out of an Authorization header, or null. */
export function extractApiToken(authHeader?: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const value = authHeader.slice("Bearer ".length).trim();
  return looksLikeApiToken(value) ? value : null;
}

/**
 * The per-token request budget: the same size as one IP's budget, charged
 * only AFTER the token's hash lookup succeeds.
 *
 * The pre-auth middleware in app.ts buckets strictly by IP; it must never
 * bucket by the presented token, because that runs before any validation and
 * a different random `tpk_` string per request would mint a fresh bucket
 * each time — a total rate-limit bypass (plus, on the database backend, an
 * INSERTed row per fake token). Charging here keeps the feature's goal — one
 * real token can't multiply its budget by spreading across IPs — while an
 * unverified string only ever burns its sender's IP budget.
 */
export type TokenRequestBudget = {
  check(
    tokenId: string,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};

export function createTokenRequestBudget(opts?: {
  store?: RateLimitStore;
  max?: number;
}): TokenRequestBudget {
  let store = opts?.store;
  const max = opts?.max ?? env.rateLimitMax;
  return {
    async check(tokenId) {
      store ??=
        env.rateLimitBackend === "database"
          ? createDatabaseRateLimitStore({
              windowMs: env.rateLimitWindowMs,
              cleanupIntervalMs: env.rateLimitCleanupIntervalMs,
            })
          : createMemoryRateLimitStore(env.rateLimitWindowMs);
      const now = Date.now();
      // Keyed by the token's row id — a stable server-side value, never
      // anything derived from the presented string.
      const hit = await store.hit(
        `${env.rateLimitKeyPrefix}:token-budget:${tokenId}`,
        now,
      );
      return rateLimitDecision(hit, max, now);
    },
  };
}

const requestBudget = createTokenRequestBudget();

/**
 * Resolve a personal token to its owner, or null when it is unknown, revoked,
 * or expired. Mirrors `getUserFromRequest` in ./clerk so the context can treat
 * the two credentials interchangeably.
 */
export async function getUserFromApiToken(
  secret: string,
  budget: TokenRequestBudget = requestBudget,
): Promise<ApiTokenIdentity | null> {
  const found = await findActiveApiToken(hashApiToken(secret));
  if (!found) return null;

  // Authenticated — now charge the token's own request budget. Over budget
  // is an explicit RATE_LIMITED error, not a null (null would read as
  // "bad credentials" and still run the request anonymously).
  const decision = await budget.check(found.token.id);
  if (!decision.allowed) {
    throw new GraphQLError(
      `Rate limit reached for this token — try again in ${decision.retryAfterSeconds}s.`,
      {
        extensions: {
          code: "RATE_LIMITED",
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      },
    );
  }

  // Fire-and-forget: a stale lastUsedAt is cosmetic and mustn't delay the
  // request or fail it.
  void touchApiToken(found.token.id).catch((err: unknown) => {
    structuredLogger("api-token").warn(
      `failed to record token use: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  return {
    user: {
      id: found.user.id,
      email: found.user.email,
      name: found.user.name,
      image: found.user.image,
    },
    token: { id: found.token.id, scopes: found.token.scopes },
  };
}
