import type { NextFunction, Request, Response } from "express";
import { lte, sql } from "drizzle-orm";

import { getRequestId, logRequestError } from "./request-log";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitHit = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = {
  hit(key: string, now: number): Promise<RateLimitHit> | RateLimitHit;
};

export type RateLimitDbModule = Pick<
  typeof import("@timetable/db"),
  "apiRateLimitBuckets" | "db"
>;

export function createMemoryRateLimitStore(windowMs: number): RateLimitStore {
  const buckets = new Map<string, Bucket>();

  return {
    hit(key, now) {
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        const next = { count: 1, resetAt: now + windowMs };
        buckets.set(key, next);
        return next;
      }

      current.count += 1;
      return current;
    },
  };
}

export function createDatabaseRateLimitStore(opts: {
  windowMs: number;
  cleanupIntervalMs: number;
  loadDbModule?: () => Promise<RateLimitDbModule>;
}): RateLimitStore {
  let lastCleanupAt = 0;
  let dbModulePromise: Promise<RateLimitDbModule> | undefined;

  function getDbModule(): Promise<RateLimitDbModule> {
    dbModulePromise ??= opts.loadDbModule?.() ?? import("@timetable/db");
    return dbModulePromise;
  }

  async function cleanupExpired(now: number): Promise<void> {
    if (now - lastCleanupAt < opts.cleanupIntervalMs) return;
    lastCleanupAt = now;
    const { apiRateLimitBuckets, db } = await getDbModule();
    await db
      .delete(apiRateLimitBuckets)
      .where(lte(apiRateLimitBuckets.resetAt, new Date(now)));
  }

  return {
    async hit(key, now) {
      const { apiRateLimitBuckets, db } = await getDbModule();
      const nowDate = new Date(now);
      const resetAt = new Date(now + opts.windowMs);
      const nowSql = nowDate.toISOString();
      const resetAtSql = resetAt.toISOString();

      const [row] = await db
        .insert(apiRateLimitBuckets)
        .values({
          bucketKey: key,
          count: 1,
          resetAt,
          updatedAt: nowDate,
        })
        .onConflictDoUpdate({
          target: apiRateLimitBuckets.bucketKey,
          set: {
            count: sql<number>`case when ${apiRateLimitBuckets.resetAt} <= ${nowSql}::timestamptz then 1 else ${apiRateLimitBuckets.count} + 1 end`,
            resetAt: sql<Date>`case when ${apiRateLimitBuckets.resetAt} <= ${nowSql}::timestamptz then ${resetAtSql}::timestamptz else ${apiRateLimitBuckets.resetAt} end`,
            updatedAt: nowDate,
          },
        })
        .returning({
          count: apiRateLimitBuckets.count,
          resetAt: apiRateLimitBuckets.resetAt,
        });

      await cleanupExpired(now);

      if (!row) throw new Error("Rate limit store did not return a bucket");
      return { count: row.count, resetAt: row.resetAt.getTime() };
    },
  };
}

export function rateLimitDecision(
  hit: RateLimitHit,
  max: number,
  now: number,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  return {
    allowed: hit.count <= max,
    remaining: Math.max(0, max - hit.count),
    retryAfterSeconds: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)),
  };
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  store?: RateLimitStore;
}): (req: Request, res: Response, next: NextFunction) => void {
  const store = opts.store ?? createMemoryRateLimitStore(opts.windowMs);

  return async (req, res, next) => {
    const now = Date.now();
    const client = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${opts.keyPrefix ?? "api"}:${client}`;

    try {
      const hit = await store.hit(key, now);
      const decision = rateLimitDecision(hit, opts.max, now);

      res.setHeader("RateLimit-Limit", String(opts.max));
      res.setHeader("RateLimit-Remaining", String(decision.remaining));
      res.setHeader("RateLimit-Reset", String(Math.ceil(hit.resetAt / 1000)));

      if (!decision.allowed) {
        res.setHeader("Retry-After", String(decision.retryAfterSeconds));
        res.status(429).json({ error: "Too many requests" });
        return;
      }

      next();
    } catch (err) {
      logRequestError(req, err, { component: "rate-limit" });
      res.status(503).json({
        error: "Rate limit unavailable",
        requestId: getRequestId(req),
      });
      return;
    }
  };
}
