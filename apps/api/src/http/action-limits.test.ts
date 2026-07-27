import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTION_LIMITS,
  assertActionLimit,
  createActionLimiter,
} from "./action-limits";
import { createMemoryRateLimitStore } from "./rate-limit";

function memoryLimiter() {
  return createActionLimiter((action) =>
    createMemoryRateLimitStore(ACTION_LIMITS[action].windowMs),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createActionLimiter", () => {
  it("allows up to the max within a window, then blocks", async () => {
    const limiter = memoryLimiter();
    for (let i = 0; i < ACTION_LIMITS.comment.max; i++) {
      expect((await limiter.check("u1", "comment")).allowed).toBe(true);
    }
    const blocked = await limiter.check("u1", "comment");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", async () => {
    const limiter = memoryLimiter();
    for (let i = 0; i <= ACTION_LIMITS.comment.max; i++) {
      await limiter.check("u1", "comment");
    }
    expect((await limiter.check("u1", "comment")).allowed).toBe(false);

    vi.advanceTimersByTime(ACTION_LIMITS.comment.windowMs + 1);
    expect((await limiter.check("u1", "comment")).allowed).toBe(true);
  });

  it("tracks users independently", async () => {
    const limiter = memoryLimiter();
    for (let i = 0; i <= ACTION_LIMITS.comment.max; i++) {
      await limiter.check("u1", "comment");
    }
    expect((await limiter.check("u1", "comment")).allowed).toBe(false);
    expect((await limiter.check("u2", "comment")).allowed).toBe(true);
  });

  it("tracks actions independently", async () => {
    const limiter = memoryLimiter();
    for (let i = 0; i <= ACTION_LIMITS.comment.max; i++) {
      await limiter.check("u1", "comment");
    }
    expect((await limiter.check("u1", "comment")).allowed).toBe(false);
    expect((await limiter.check("u1", "topic")).allowed).toBe(true);
  });

  it("spends one unit per recipient for bulk invites", async () => {
    const limiter = memoryLimiter();
    const bulk = await limiter.check("u1", "invite", ACTION_LIMITS.invite.max);
    expect(bulk.allowed).toBe(true);
    expect((await limiter.check("u1", "invite")).allowed).toBe(false);
  });
});

describe("assertActionLimit", () => {
  it("throws a RATE_LIMITED GraphQLError when over budget", async () => {
    // The module-level limiter is shared across tests — use a unique user.
    const userId = `assert-test-${Math.random()}`;
    for (let i = 0; i < ACTION_LIMITS.comment.max; i++) {
      await assertActionLimit(userId, "comment");
    }
    const err = await assertActionLimit(userId, "comment").catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect((err as GraphQLError).extensions.code).toBe("RATE_LIMITED");
    expect((err as GraphQLError).extensions.retryAfterSeconds).toBeGreaterThan(
      0,
    );
    expect((err as GraphQLError).message).toMatch(/commenting too quickly/);
  });
});
