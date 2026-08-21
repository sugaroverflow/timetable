import type { Request, RequestHandler, Response } from "express";
import { sql } from "drizzle-orm";

import { logRequestError } from "./request-log";

/**
 * The slice of @timetable/db the health probe needs. Narrow on purpose so
 * tests can inject a fake without standing up Postgres (same seam as
 * rate-limit.ts's RateLimitDbModule).
 */
export type HealthDbModule = Pick<typeof import("@timetable/db"), "db">;

export type HealthBody = {
  ok: boolean;
  db: "up" | "down";
  forwarding?: {
    /** What Express resolved as the client, i.e. what the rate limiter keys on. */
    ip: string | undefined;
    /** The full trusted chain Express derived (left = closest to the client). */
    ips: string[];
    /** The raw header, before Express applied `trust proxy`. */
    xForwardedFor: string | undefined;
    /** The `trust proxy` setting that produced `ip`. */
    trustProxyHops: number;
  };
};

/**
 * Liveness + database readiness.
 *
 * This is the endpoint DigitalOcean polls to decide whether the API is alive,
 * so it must fail when the app cannot actually serve: previously it returned
 * `{ok: true}` unconditionally, meaning an unreachable database, an exhausted
 * pool or a broken schema all read as perfectly healthy — no restart, no
 * signal (ops R3).
 *
 * Deliberately NOT behind the rate limiter (see app.ts): a health probe that
 * can be throttled is not a health probe.
 *
 * The timeout bounds how long a hung database can stall the probe. The query
 * behind it still holds its connection until the driver gives up, so a fully
 * hung Postgres will eventually exhaust the pool — which is correct, because
 * at that point the container SHOULD be restarted, and the restart clears it.
 */
export function createHealthHandler(
  opts: {
    timeoutMs?: number;
    debugForwarding?: boolean;
    trustProxyHops?: number;
    loadDbModule?: () => Promise<HealthDbModule>;
  } = {},
): RequestHandler {
  const timeoutMs = opts.timeoutMs ?? 2_000;
  let dbModulePromise: Promise<HealthDbModule> | undefined;

  function getDbModule(): Promise<HealthDbModule> {
    dbModulePromise ??= opts.loadDbModule?.() ?? import("@timetable/db");
    return dbModulePromise;
  }

  async function pingDatabase(): Promise<void> {
    const { db } = await getDbModule();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        db.execute(sql`select 1`),
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`health db check timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return async (req: Request, res: Response) => {
    let dbUp = true;
    try {
      await pingDatabase();
    } catch (err) {
      dbUp = false;
      logRequestError(req, err, { component: "health" });
    }

    const body: HealthBody = { ok: dbUp, db: dbUp ? "up" : "down" };

    // Dev-only forwarding report (ops R1). TRUST_PROXY_HOPS=1 is landing
    // Express on a rotating DigitalOcean edge address rather than the real
    // client, which scatters every caller across a pool of rate-limit
    // buckets. The correct hop count can't be guessed from outside — it
    // depends on how many entries DigitalOcean puts in X-Forwarded-For — so
    // this reports the chain the API actually receives. Never enabled in
    // production: it exposes internal proxy topology.
    if (opts.debugForwarding) {
      const header = req.headers["x-forwarded-for"];
      body.forwarding = {
        ip: req.ip,
        ips: req.ips,
        xForwardedFor: Array.isArray(header) ? header.join(", ") : header,
        trustProxyHops: opts.trustProxyHops ?? 0,
      };
    }

    res.status(dbUp ? 200 : 503).json(body);
  };
}
