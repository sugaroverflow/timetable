import { describe, expect, it } from "vitest";

import {
  createDatabaseRateLimitStore,
  createMemoryRateLimitStore,
  rateLimitDecision,
  type RateLimitDbModule,
} from "./rate-limit";

type DbCall = { method: string; value?: unknown; args?: unknown };

function createFakeRateLimitDb(row: { count: number; resetAt: Date }) {
  const calls: DbCall[] = [];
  const apiRateLimitBuckets = {
    bucketKey: { name: "bucketKey" },
    count: { name: "count" },
    resetAt: { name: "resetAt" },
    updatedAt: { name: "updatedAt" },
  };

  const insertChain = {
    values(value: unknown) {
      calls.push({ method: "insert.values", value });
      return insertChain;
    },
    onConflictDoUpdate(args: unknown) {
      calls.push({ method: "insert.onConflictDoUpdate", args });
      return insertChain;
    },
    returning(value: unknown) {
      calls.push({ method: "insert.returning", value });
      return Promise.resolve([row]);
    },
  };
  const deleteChain = {
    where(args: unknown) {
      calls.push({ method: "delete.where", args });
      return Promise.resolve();
    },
  };

  return {
    calls,
    module: {
      apiRateLimitBuckets,
      db: {
        insert(value: unknown) {
          calls.push({ method: "insert", value });
          return insertChain;
        },
        delete(value: unknown) {
          calls.push({ method: "delete", value });
          return deleteChain;
        },
      },
    } as unknown as RateLimitDbModule,
  };
}

describe("createMemoryRateLimitStore", () => {
  it("increments requests inside a shared window", async () => {
    const store = createMemoryRateLimitStore(1_000);

    await expect(Promise.resolve(store.hit("client", 10_000))).resolves.toEqual({
      count: 1,
      resetAt: 11_000,
    });
    await expect(Promise.resolve(store.hit("client", 10_500))).resolves.toEqual({
      count: 2,
      resetAt: 11_000,
    });
  });

  it("starts a new bucket after the prior window expires", async () => {
    const store = createMemoryRateLimitStore(1_000);

    await store.hit("client", 10_000);
    await expect(Promise.resolve(store.hit("client", 11_000))).resolves.toEqual({
      count: 1,
      resetAt: 12_000,
    });
  });
});

describe("createDatabaseRateLimitStore", () => {
  it("upserts hits into shared buckets and returns millisecond reset times", async () => {
    const resetAt = new Date(11_000);
    const fakeDb = createFakeRateLimitDb({ count: 2, resetAt });
    const store = createDatabaseRateLimitStore({
      windowMs: 1_000,
      cleanupIntervalMs: 60_000,
      loadDbModule: async () => fakeDb.module,
    });

    await expect(store.hit("api:client", 10_000)).resolves.toEqual({
      count: 2,
      resetAt: 11_000,
    });

    expect(fakeDb.calls).toEqual([
      { method: "insert", value: fakeDb.module.apiRateLimitBuckets },
      {
        method: "insert.values",
        value: {
          bucketKey: "api:client",
          count: 1,
          resetAt,
          updatedAt: new Date(10_000),
        },
      },
      expect.objectContaining({ method: "insert.onConflictDoUpdate" }),
      expect.objectContaining({ method: "insert.returning" }),
    ]);
  });

  it("cleans expired buckets only after the cleanup interval elapses", async () => {
    const fakeDb = createFakeRateLimitDb({
      count: 1,
      resetAt: new Date(11_000),
    });
    const store = createDatabaseRateLimitStore({
      windowMs: 1_000,
      cleanupIntervalMs: 5_000,
      loadDbModule: async () => fakeDb.module,
    });

    await store.hit("api:client", 1_000);
    await store.hit("api:client", 6_000);

    expect(fakeDb.calls.filter((call) => call.method === "delete")).toHaveLength(
      1,
    );
    expect(
      fakeDb.calls.filter((call) => call.method === "delete.where"),
    ).toHaveLength(1);
  });
});

describe("rateLimitDecision", () => {
  it("allows requests up to the configured maximum", () => {
    expect(rateLimitDecision({ count: 3, resetAt: 20_000 }, 3, 10_000)).toEqual(
      {
        allowed: true,
        remaining: 0,
        retryAfterSeconds: 10,
      },
    );
  });

  it("blocks requests over the configured maximum", () => {
    expect(rateLimitDecision({ count: 4, resetAt: 20_000 }, 3, 10_000)).toEqual(
      {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 10,
      },
    );
  });
});
