import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { db, pushSubscriptions } from "@timetable/db";
import {
  PUSH_DEVICE_CAP,
  PUSH_ENDPOINT_MAX,
  normalizePushKeys,
  normalizePushLabel,
} from "@timetable/shared";

/**
 * Web Push device subscriptions (docs/web-push-plan.md, #368, step 1).
 *
 * A subscription is a DEVICE, owned by a user: one switch per phone or
 * browser covers every forum there, and which kinds alert is per forum
 * (`digestSettings.push`, read through shared `isPushKindEnabled`).
 *
 * The endpoint + keys are a capability — whoever holds them (with our VAPID
 * key) can put text on that screen — so they are never logged and never
 * returned to the web app. Database errors are re-thrown sanitised because
 * Drizzle's messages embed the query parameters.
 *
 * Validation of the endpoint's HOST (the push-service allowlist) belongs to
 * the API transport (`validPushEndpoint`); routes check it before calling
 * `subscribePush`. Here only shape is checked.
 */

/** Advisory-lock namespaces (the first int of the two-int form), so push
 * locks can't collide with each other or with any future lock. `sweep` is
 * for the step 3 sender's `pg_try_advisory_xact_lock(sweep, 0)`. */
export const PUSH_LOCK_NAMESPACE = {
  sweep: 368_000,
  endpoint: 368_001,
  user: 368_002,
} as const;

/** One device as its owner sees it. Deliberately no endpoint or keys. */
export type PushDevice = {
  id: string;
  label: string | null;
  createdAt: Date;
  lastSentAt: Date | null;
  /** Whether this is the device asking (its endpoint was passed in). */
  current: boolean;
};

export type PushSubscribeInput = {
  endpoint: string;
  /** `PushSubscription.toJSON().keys.p256dh` */
  p256dh: string;
  /** `PushSubscription.toJSON().keys.auth` */
  auth: string;
  /** Optional short device label ("Chrome on Android"). */
  label?: string | null;
};

/** `invalid` → 400; `taken` → 409 (the endpoint belongs to another
 * account: a shared browser is never silently moved — the client should
 * `unsubscribe()` the browser subscription and subscribe afresh, which
 * yields a new endpoint and strands the old row, deleted as `gone` on its
 * next send); `cap` → 409/429 (PUSH_DEVICE_CAP reached). */
export type PushSubscribeResult =
  | { ok: true; created: boolean; device: PushDevice }
  | { ok: false; reason: "invalid" | "taken" | "cap" };

class PushStoreError extends Error {
  constructor() {
    super("Push subscription operation failed");
    this.name = "PushStoreError";
  }
}

/** Never surface a database error verbatim: it can carry the endpoint. */
async function sanitized<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new PushStoreError();
  }
}

/** Shape-only endpoint check: an absolute https URL of sane length. */
export function isPlausiblePushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") return false;
  if (endpoint.length === 0 || endpoint.length > PUSH_ENDPOINT_MAX)
    return false;
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

function lockSql(namespace: number, key: string) {
  return sql`select pg_advisory_xact_lock(${sql.raw(String(namespace))}, hashtext(${key}))`;
}

const deviceColumns = {
  id: pushSubscriptions.id,
  label: pushSubscriptions.label,
  createdAt: pushSubscriptions.createdAt,
  lastSentAt: pushSubscriptions.lastSentAt,
  endpoint: pushSubscriptions.endpoint,
};

function toDevice(
  row: {
    id: string;
    label: string | null;
    createdAt: Date;
    lastSentAt: Date | null;
    endpoint: string;
  },
  currentEndpoint?: string | null,
): PushDevice {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
    lastSentAt: row.lastSentAt,
    current: Boolean(currentEndpoint) && row.endpoint === currentEndpoint,
  };
}

/**
 * Turn alerts on for this device, or refresh its keys (browsers rotate
 * them; the client re-sends on every visit with alerts on). Idempotent for
 * the same user + endpoint: keys and label are updated, the failure count
 * reset, and `createdAt` kept — events from before the device first
 * subscribed never alert.
 *
 * Two advisory locks, always in this order so they can't deadlock: the
 * ENDPOINT (two accounts racing for one browser serialise, and the loser
 * gets `taken`), then the USER (two devices racing past the cap serialise).
 */
export async function subscribePush(
  userId: string,
  input: PushSubscribeInput,
): Promise<PushSubscribeResult> {
  if (!isPlausiblePushEndpoint(input.endpoint))
    return { ok: false, reason: "invalid" };
  const keys = normalizePushKeys(input.p256dh, input.auth);
  if (!keys) return { ok: false, reason: "invalid" };
  const label = normalizePushLabel(input.label);
  const { endpoint } = input;

  return sanitized(() =>
    db.transaction(async (tx): Promise<PushSubscribeResult> => {
      await tx.execute(lockSql(PUSH_LOCK_NAMESPACE.endpoint, endpoint));
      const [owner] = await tx
        .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);
      if (owner && owner.userId !== userId)
        return { ok: false, reason: "taken" };

      const now = new Date();
      if (owner) {
        const [row] = await tx
          .update(pushSubscriptions)
          .set({
            p256dh: keys.p256dh,
            auth: keys.auth,
            ...(label ? { label } : {}),
            failureCount: 0,
            updatedAt: now,
          })
          .where(eq(pushSubscriptions.id, owner.id))
          .returning(deviceColumns);
        return { ok: true, created: false, device: toDevice(row!, endpoint) };
      }

      await tx.execute(lockSql(PUSH_LOCK_NAMESPACE.user, userId));
      const [held] = await tx
        .select({ n: count() })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, userId),
            ne(pushSubscriptions.endpoint, endpoint),
          ),
        );
      if ((held?.n ?? 0) >= PUSH_DEVICE_CAP)
        return { ok: false, reason: "cap" };

      const [row] = await tx
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          label,
        })
        .returning(deviceColumns);
      return { ok: true, created: true, device: toDevice(row!, endpoint) };
    }),
  );
}

/** Turn alerts off for this device. Only ever removes the caller's own
 * row; true when one was removed. Other devices are untouched. */
export async function unsubscribePush(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  if (typeof endpoint !== "string" || endpoint.length > PUSH_ENDPOINT_MAX)
    return false;
  return sanitized(async () => {
    const removed = await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      )
      .returning({ id: pushSubscriptions.id });
    return removed.length > 0;
  });
}

/** This user's devices, oldest first. Pass the asking browser's endpoint
 * to mark it `current` (the "Get Notifications" link and the alerts line
 * ask "is THIS device on?" without the server echoing endpoints back). */
export async function listPushDevices(
  userId: string,
  currentEndpoint?: string | null,
): Promise<PushDevice[]> {
  return sanitized(async () => {
    const rows = await db
      .select(deviceColumns)
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(asc(pushSubscriptions.createdAt));
    return rows.map((row) => toDevice(row, currentEndpoint));
  });
}

/** Whether this user has alerts on for the device with this endpoint. */
export async function hasPushSubscription(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  if (typeof endpoint !== "string" || endpoint.length > PUSH_ENDPOINT_MAX)
    return false;
  return sanitized(async () => {
    const [row] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      )
      .limit(1);
    return Boolean(row);
  });
}
