import type { Response } from "express";
import { GraphQLError } from "graphql";

import { env } from "../env";
import {
  createDatabaseRateLimitStore,
  createMemoryRateLimitStore,
  rateLimitDecision,
  type RateLimitStore,
} from "./rate-limit";

/**
 * Per-user write throttles. The per-IP limiter in app.ts caps overall
 * request volume; these cap how fast one *account* can create content or
 * send email — the ceiling that matters once users point scripts or AI
 * agents at the API (and it holds across IPs, unlike the middleware).
 * Generous for humans, binding for runaway automation.
 */
export const ACTION_LIMITS = {
  /** Topic comments, replies, and slot comments. */
  comment: { windowMs: 60_000, max: 12 },
  /** ❤️ toggles, on topics and as a host. Well above what a human clicking
   * through a review queue reaches; binding on a script that would otherwise
   * churn hearts (and their weighted-score recomputation) in a loop. */
  heart: { windowMs: 60_000, max: 60 },
  /** Topic creation. */
  topic: { windowMs: 60 * 60_000, max: 30 },
  /** Invite emails, counted per recipient (bulk paste of a cohort is fine). */
  invite: { windowMs: 60 * 60_000, max: 100 },
} as const;

export type LimitedAction = keyof typeof ACTION_LIMITS;

const BLOCKED_MESSAGES: Record<LimitedAction, string> = {
  comment: "You're commenting too quickly",
  heart: "You're ❤️-ing too quickly",
  topic: "You're creating topics too quickly",
  invite: "Too many invites sent recently",
};

export type ActionDecision = { allowed: boolean; retryAfterSeconds: number };

export type ActionLimiter = {
  check(
    userId: string,
    action: LimitedAction,
    count?: number,
  ): Promise<ActionDecision>;
};

function defaultStore(action: LimitedAction): RateLimitStore {
  const { windowMs } = ACTION_LIMITS[action];
  return env.rateLimitBackend === "database"
    ? createDatabaseRateLimitStore({
        windowMs,
        cleanupIntervalMs: env.rateLimitCleanupIntervalMs,
      })
    : createMemoryRateLimitStore(windowMs);
}

export function createActionLimiter(
  storeFor: (action: LimitedAction) => RateLimitStore = defaultStore,
): ActionLimiter {
  const stores = new Map<LimitedAction, RateLimitStore>();

  return {
    async check(userId, action, count = 1) {
      let store = stores.get(action);
      if (!store) {
        store = storeFor(action);
        stores.set(action, store);
      }
      const now = Date.now();
      const key = `${env.rateLimitKeyPrefix}:action:${action}:${userId}`;
      let hit = await store.hit(key, now);
      for (let i = 1; i < count; i++) hit = await store.hit(key, now);
      const { allowed, retryAfterSeconds } = rateLimitDecision(
        hit,
        ACTION_LIMITS[action].max,
        now,
      );
      return { allowed, retryAfterSeconds };
    },
  };
}

const limiter = createActionLimiter();

function blockedMessage(action: LimitedAction, retryAfterSeconds: number) {
  const wait =
    retryAfterSeconds > 90
      ? `${Math.ceil(retryAfterSeconds / 60)} minutes`
      : `${retryAfterSeconds} seconds`;
  return `${BLOCKED_MESSAGES[action]} — try again in ${wait}.`;
}

/** GraphQL resolver guard: throws a RATE_LIMITED error when over budget. */
export async function assertActionLimit(
  userId: string,
  action: LimitedAction,
  count = 1,
): Promise<void> {
  const decision = await limiter.check(userId, action, count);
  if (!decision.allowed) {
    throw new GraphQLError(blockedMessage(action, decision.retryAfterSeconds), {
      extensions: {
        code: "RATE_LIMITED",
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    });
  }
}

/** REST route guard: sends the 429 and returns false when over budget. */
export async function enforceActionLimit(
  res: Response,
  userId: string,
  action: LimitedAction,
  count = 1,
): Promise<boolean> {
  const decision = await limiter.check(userId, action, count);
  if (!decision.allowed) {
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
    res.status(429).json({
      error: blockedMessage(action, decision.retryAfterSeconds),
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return false;
  }
  return true;
}
