import {
  countActiveApiTokens,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  type ApiTokenRecord,
} from "@timetable/core";
import {
  createApiTokenSchema,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  MAX_ACTIVE_TOKENS_PER_USER,
  normalizeScopes,
} from "@timetable/shared";

import { assertActionLimit } from "../http/action-limits";

import { builder } from "./builder";
import { badRequest, forbidden, requireUser } from "./guards";

/**
 * Personal API tokens: the member's own long-lived credentials for scripts and
 * external clients. Account-level, not per-forum — one token carries its
 * owner's roles in every forum they belong to.
 *
 * These three fields are deliberately absent from MUTATION_SCOPES
 * (graphql/token-scopes.ts), so no token can reach them; the explicit
 * `ctx.apiToken` refusal below says so in the error message rather than
 * leaving the caller with a bare default-deny.
 */

const ApiTokenType = builder.objectRef<ApiTokenRecord>("ApiToken").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    /** First 8 characters of the secret — enough to tell rows apart, not
     * enough to authenticate. */
    prefix: t.exposeString("prefix"),
    scopes: t.exposeStringList("scopes"),
    createdAt: t.string({ resolve: (tk) => tk.createdAt.toISOString() }),
    lastUsedAt: t.string({
      nullable: true,
      resolve: (tk) => tk.lastUsedAt?.toISOString() ?? null,
    }),
    expiresAt: t.string({
      nullable: true,
      resolve: (tk) => tk.expiresAt?.toISOString() ?? null,
    }),
    revokedAt: t.string({
      nullable: true,
      resolve: (tk) => tk.revokedAt?.toISOString() ?? null,
    }),
  }),
});

/** The one and only response that carries a token's plaintext secret. */
const NewApiTokenType = builder
  .objectRef<{ secret: string; token: ApiTokenRecord }>("NewApiToken")
  .implement({
    fields: (t) => ({
      /** Shown once. Nothing can recover it afterwards — only its hash is
       * stored. */
      secret: t.exposeString("secret"),
      token: t.field({ type: ApiTokenType, resolve: (r) => r.token }),
    }),
  });

/** Token administration is session-only: a token must never be able to mint
 * another token or widen its own scopes. token-scopes.ts already denies these
 * fields by omission; this makes the refusal legible. */
function refuseTokenAuth(apiToken: unknown): void {
  if (apiToken) {
    forbidden("Sign in to manage API tokens — a token can't manage tokens");
  }
}

builder.queryFields((t) => ({
  /** The caller's own tokens, newest first. Revoked ones are included so they
   * show as revoked rather than silently disappearing. Never exposes a hash. */
  myApiTokens: t.field({
    type: [ApiTokenType],
    resolve: async (_p, _a, ctx) => {
      const user = await requireUser(ctx);
      refuseTokenAuth(ctx.apiToken);
      return listApiTokens(user.id);
    },
  }),
}));

builder.mutationFields((t) => ({
  /** Mint a token and return its secret exactly once. */
  createApiToken: t.field({
    type: NewApiTokenType,
    args: {
      name: t.arg.string({ required: true }),
      /** Empty list = a read-only token. */
      scopes: t.arg.stringList({ required: true }),
      /** Omitted = the 90-day default. An EXPLICIT null = never expires —
       * "forever" has to be asked for, it is never what you get by
       * forgetting the argument. */
      expiresInDays: t.arg.int({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      refuseTokenAuth(ctx.apiToken);
      await assertActionLimit(user.id, "tokenMint");

      const parsed = createApiTokenSchema.safeParse({
        name: args.name,
        scopes: args.scopes,
        // Preserved as-is: undefined (omitted) and null (explicit) diverge
        // below.
        expiresInDays: args.expiresInDays,
      });
      if (!parsed.success) {
        badRequest(parsed.error.issues[0]?.message ?? "Invalid token request");
      }

      if ((await countActiveApiTokens(user.id)) >= MAX_ACTIVE_TOKENS_PER_USER) {
        badRequest(
          `You already have ${MAX_ACTIVE_TOKENS_PER_USER} active tokens — revoke one you no longer use first.`,
        );
      }

      const days =
        parsed.data.expiresInDays === undefined
          ? DEFAULT_TOKEN_EXPIRY_DAYS
          : parsed.data.expiresInDays;
      const expiresAt =
        days === null ? null : new Date(Date.now() + days * 86_400_000);

      return createApiToken(user.id, {
        name: parsed.data.name,
        scopes: normalizeScopes(parsed.data.scopes),
        expiresAt,
      });
    },
  }),

  /** Revoke one of the caller's own tokens. False when the id isn't theirs or
   * was already revoked — the same answer either way, so this can't be used to
   * probe for other people's token ids. */
  revokeApiToken: t.boolean({
    args: { tokenId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      refuseTokenAuth(ctx.apiToken);
      return revokeApiToken(user.id, args.tokenId);
    },
  }),
}));
