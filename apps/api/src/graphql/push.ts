/**
 * Web Push GraphQL surface (docs/web-push-plan.md, step 2 of §6). Today only
 * the public key; the device list and the push kinds on
 * updateMyForumDigestSettings follow once the push tables exist (step 1).
 */
import type { ApiContext } from "../context";
import { env } from "../env";
import type { PushConfig } from "../push-config";
import { builder } from "./builder";

/**
 * The VAPID public key a browser subscribes with, or null wherever push
 * can't be used: no keys configured (the feature is off), signed out, an
 * admin's view-as preview (it must not subscribe the previewed person's
 * device), or a personal API token (scripts have no device). The web app
 * hides every push control when this is null (plan §2 finding 1). Still
 * returned while PUSH_PAUSED is set: the kill switch keeps the controls.
 */
export function pushPublicKeyFor(
  ctx: Pick<ApiContext, "user" | "impersonation" | "apiToken">,
  config: PushConfig | null = env.push,
): string | null {
  if (!config || !ctx.user || ctx.impersonation || ctx.apiToken) return null;
  return config.publicKey;
}

builder.queryFields((t) => ({
  pushPublicKey: t.string({
    nullable: true,
    resolve: (_p, _a, ctx) => pushPublicKeyFor(ctx),
  }),
}));
