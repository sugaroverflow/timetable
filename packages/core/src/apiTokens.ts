import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import { apiTokens, db, users, type ApiToken } from "@timetable/db";
import { normalizeScopes, type TokenScope } from "@timetable/shared";

/**
 * Personal API tokens (2026-08-13). A member creates a long-lived, scoped
 * credential for scripts and external clients, because the Clerk session
 * token the app itself uses expires after ~60 seconds.
 *
 * Only the hash is stored. `createApiToken` is the one and only place the
 * plaintext secret exists, and it is never written to the database or a log.
 */

/** Every personal token starts with this, so the API can tell a personal
 * token from a Clerk JWT without a database probe. */
export const API_TOKEN_PREFIX = "tpk_";

/** Characters of the secret kept in cleartext for display ("tpk_a1b2c3d4…"). */
const DISPLAY_PREFIX_LENGTH = 8;

/** SHA-256 rather than bcrypt: authentication is a keyed lookup, not a
 * compare, and the secret is 256 bits of CSPRNG output — there is no
 * dictionary to slow down, and a per-request bcrypt would be the most
 * expensive thing in the request. */
export function hashApiToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** A token row with the scopes narrowed to the ones still recognised. */
export type ApiTokenRecord = Omit<ApiToken, "scopes" | "tokenHash"> & {
  scopes: TokenScope[];
};

function toRecord(row: ApiToken): ApiTokenRecord {
  const { tokenHash: _hash, ...rest } = row;
  return { ...rest, scopes: normalizeScopes(row.scopes ?? []) };
}

/**
 * Mint a token. Returns the plaintext secret alongside the stored row — the
 * caller must show it to its owner immediately, because nothing can recover
 * it afterwards.
 */
export async function createApiToken(
  userId: string,
  input: {
    name: string;
    scopes: readonly TokenScope[];
    expiresAt?: Date | null;
  },
): Promise<{ secret: string; token: ApiTokenRecord }> {
  const secret = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: input.name.trim(),
      tokenHash: hashApiToken(secret),
      prefix: secret.slice(
        API_TOKEN_PREFIX.length,
        API_TOKEN_PREFIX.length + DISPLAY_PREFIX_LENGTH,
      ),
      scopes: normalizeScopes(input.scopes),
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create API token");
  return { secret, token: toRecord(row) };
}

/** A member's tokens, newest first. Revoked ones are included so the UI can
 * show them as revoked rather than having them silently vanish. Bounded:
 * active tokens are capped at MAX_ACTIVE_TOKENS_PER_USER, so 200 newest is
 * always the full active set plus generous revoked/expired history. */
export async function listApiTokens(userId: string): Promise<ApiTokenRecord[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .limit(200);
  return rows.map(toRecord);
}

/** How many of a member's tokens could still authenticate right now —
 * unrevoked and unexpired. The creation cap counts these, not history. */
export async function countActiveApiTokens(userId: string): Promise<number> {
  const now = new Date();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
      ),
    );
  return row?.n ?? 0;
}

/** Revoke one of the caller's own tokens. Scoped by userId in the WHERE
 * clause, so a wrong id can never touch someone else's token. Returns false
 * when nothing matched (unknown id, or already revoked). */
export async function revokeApiToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt),
      ),
    )
    .returning({ id: apiTokens.id });
  return Boolean(row);
}

/**
 * Resolve a presented secret's hash to its owner and scopes, or null when the
 * token is unknown, revoked, or expired. Date comparison uses `gt` rather
 * than a raw `sql` template — raw Date params bypass Drizzle's column mapping
 * and throw on hosted Postgres (see CLAUDE.md).
 */
export async function findActiveApiToken(tokenHash: string): Promise<{
  token: ApiTokenRecord;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
  };
} | null> {
  const now = new Date();
  const [found] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(
      and(
        eq(apiTokens.tokenHash, tokenHash),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!found) return null;
  return {
    token: toRecord(found.token),
    user: {
      id: found.user.id,
      email: found.user.email,
      name: found.user.name,
      image: found.user.image,
    },
  };
}

/** Record that a token was just used. Callers deliberately don't await this —
 * a stale `lastUsedAt` is cosmetic, and the write shouldn't sit in the
 * request's critical path. */
export async function touchApiToken(tokenId: string): Promise<void> {
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, tokenId));
}
