/**
 * Web Push GraphQL surface (docs/web-push-plan.md, #368): the public key
 * (step 2), and the device reads (step 2b) — "is THIS device on?" and this
 * user's device list. Turning a device on or off is REST
 * (`/api/push-subscriptions`), like every other per-user write; which kinds
 * alert is `pushKindsJson` on updateMyForumDigestSettings (members.ts).
 */
import {
  hasPushSubscription,
  listPushDevices,
  type PushDevice,
} from "@timetable/core";
import { PUSH_ENDPOINT_MAX } from "@timetable/shared";

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

/** The user whose devices a push read may look at, or null wherever the
 * device reads answer "nothing": the same cases as `pushPublicKeyFor`. A
 * view-as preview in particular must not reveal the previewed person's
 * devices, and a token has no device to ask about. */
function pushReader(ctx: ApiContext): string | null {
  return pushPublicKeyFor(ctx) === null ? null : ctx.user!.id;
}

/** An endpoint argument worth a database read: a non-empty string of sane
 * length. Anything else simply isn't one of this user's devices. */
function plausibleEndpoint(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= PUSH_ENDPOINT_MAX
  );
}

/** One device as its owner sees it: an id, the optional label the client
 * gave it, and dates. Never the endpoint or the payload keys. */
const PushDeviceType = builder.objectRef<PushDevice>("PushDevice").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    label: t.exposeString("label", { nullable: true }),
    createdAt: t.string({ resolve: (d) => d.createdAt.toISOString() }),
    lastSentAt: t.string({
      nullable: true,
      resolve: (d) => d.lastSentAt?.toISOString() ?? null,
    }),
    /** Whether this is the asking device (the `endpoint` passed to
     * `myPushDevices`) — a boolean, so the endpoint is never echoed. */
    current: t.exposeBoolean("current"),
  }),
});

builder.queryFields((t) => ({
  pushPublicKey: t.string({
    nullable: true,
    resolve: (_p, _a, ctx) => pushPublicKeyFor(ctx),
  }),

  /** "Is THIS device on?" — the browser passes its own subscription's
   * endpoint and gets a yes/no, so the server never hands endpoints out.
   * False whenever `pushPublicKey` is null (push off, signed out, view-as,
   * a personal token). */
  myPushDeviceEnabled: t.boolean({
    args: { endpoint: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const userId = pushReader(ctx);
      if (!userId || !plausibleEndpoint(args.endpoint)) return false;
      return hasPushSubscription(userId, args.endpoint);
    },
  }),

  /** This user's devices with alerts on, oldest first: labels and dates,
   * never endpoints. Pass this browser's endpoint to mark it `current`.
   * Null whenever `pushPublicKey` is null. */
  myPushDevices: t.field({
    type: [PushDeviceType],
    nullable: true,
    args: { endpoint: t.arg.string({ required: false }) },
    resolve: async (_p, args, ctx) => {
      const userId = pushReader(ctx);
      if (!userId) return null;
      return listPushDevices(
        userId,
        plausibleEndpoint(args.endpoint) ? args.endpoint : null,
      );
    },
  }),
}));
