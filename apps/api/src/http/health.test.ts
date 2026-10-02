import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createHealthHandler, type HealthDbModule } from "./health";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function fakeReq(overrides: Partial<Request> = {}) {
  return {
    method: "GET",
    originalUrl: "/health",
    headers: {},
    ip: undefined,
    ips: [],
    ...overrides,
  } as unknown as Request;
}

function dbModule(
  execute: () => Promise<unknown>,
): () => Promise<HealthDbModule> {
  return async () => ({ db: { execute } }) as unknown as HealthDbModule;
}

describe("createHealthHandler", () => {
  it("reports ok when the database answers", async () => {
    const handler = createHealthHandler({
      loadDbModule: dbModule(async () => []),
    });
    const res = fakeRes();

    await handler(fakeReq(), res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, db: "up" });
  });

  it("returns 503 when the database query fails", async () => {
    const handler = createHealthHandler({
      loadDbModule: dbModule(async () => {
        throw new Error("connection refused");
      }),
    });
    const res = fakeRes();

    await handler(fakeReq(), res, vi.fn());

    // The whole point of ops R3: an unreachable database must NOT read as
    // healthy, or DigitalOcean never restarts a wedged container.
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, db: "down" });
  });

  it("returns 503 when the database hangs past the timeout", async () => {
    const handler = createHealthHandler({
      timeoutMs: 10,
      loadDbModule: dbModule(() => new Promise(() => {})),
    });
    const res = fakeRes();

    await handler(fakeReq(), res, vi.fn());

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ ok: false, db: "down" });
  });

  it("omits the forwarding report unless explicitly enabled", async () => {
    const handler = createHealthHandler({
      loadDbModule: dbModule(async () => []),
    });
    const res = fakeRes();

    await handler(
      fakeReq({ headers: { "x-forwarded-for": "203.0.113.9, 10.1.2.3" } }),
      res,
      vi.fn(),
    );

    expect(res.body).not.toHaveProperty("forwarding");
  });

  it("reports the forwarding chain when enabled (ops R1 diagnostic)", async () => {
    const handler = createHealthHandler({
      debugForwarding: true,
      trustProxyHops: 1,
      loadDbModule: dbModule(async () => []),
    });
    const res = fakeRes();

    await handler(
      fakeReq({
        headers: { "x-forwarded-for": "203.0.113.9, 10.1.2.3" },
        ip: "10.1.2.3",
        ips: ["203.0.113.9", "10.1.2.3"],
      }),
      res,
      vi.fn(),
    );

    expect(res.body).toMatchObject({
      ok: true,
      forwarding: {
        ip: "10.1.2.3",
        ips: ["203.0.113.9", "10.1.2.3"],
        xForwardedFor: "203.0.113.9, 10.1.2.3",
        trustProxyHops: 1,
      },
    });
  });
});
