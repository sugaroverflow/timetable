import {
  API_TOKEN_PREFIX,
  findActiveApiToken,
  hashApiToken,
  touchApiToken,
} from "@timetable/core";
import type { TokenScope } from "@timetable/shared";

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
 * Resolve a personal token to its owner, or null when it is unknown, revoked,
 * or expired. Mirrors `getUserFromRequest` in ./clerk so the context can treat
 * the two credentials interchangeably.
 */
export async function getUserFromApiToken(
  secret: string,
): Promise<ApiTokenIdentity | null> {
  const found = await findActiveApiToken(hashApiToken(secret));
  if (!found) return null;

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
