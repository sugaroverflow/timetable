import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRateLimitStore } from "../http/rate-limit";

import {
  createTokenRequestBudget,
  extractApiToken,
  getUserFromApiToken,
  looksLikeApiToken,
} from "./api-token";

vi.mock("@timetable/core", () => ({
  API_TOKEN_PREFIX: "tpk_",
  findActiveApiToken: vi.fn(),
  hashApiToken: vi.fn((secret: string) => `hash(${secret})`),
  touchApiToken: vi.fn(async () => {}),
}));

const core = await import("@timetable/core");

const SECRET = "tpk_abcdefghijklmnopqrstuvwxyz0123456789";
/** Shape of a real Clerk session JWT: three base64url segments. */
const CLERK_JWT = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.eyJzdWIiOiJ1XzEifQ.sig";

const found = {
  token: {
    id: "token-1",
    userId: "member-1",
    name: "triage deck",
    prefix: "abcdefgh",
    scopes: ["hearts:write" as const],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2026-08-13T00:00:00.000Z"),
  },
  user: {
    id: "member-1",
    email: "member-1@example.com",
    name: "Member One",
    image: null,
  },
};

beforeEach(() => {
  vi.mocked(core.findActiveApiToken).mockReset();
  vi.mocked(core.touchApiToken).mockClear();
  vi.mocked(core.touchApiToken).mockResolvedValue(undefined);
});

describe("looksLikeApiToken", () => {
  it("recognises a personal token", () => {
    expect(looksLikeApiToken(SECRET)).toBe(true);
  });

  it("does not mistake a Clerk session JWT for one", () => {
    expect(looksLikeApiToken(CLERK_JWT)).toBe(false);
  });
});

describe("extractApiToken", () => {
  it("pulls the token out of a Bearer header", () => {
    expect(extractApiToken(`Bearer ${SECRET}`)).toBe(SECRET);
  });

  it("returns null for a session JWT, a missing header, or another scheme", () => {
    expect(extractApiToken(`Bearer ${CLERK_JWT}`)).toBeNull();
    expect(extractApiToken(undefined)).toBeNull();
    expect(extractApiToken(null)).toBeNull();
    expect(extractApiToken(`token ${SECRET}`)).toBeNull();
  });
});

describe("getUserFromApiToken", () => {
  it("resolves the owner and scopes by the secret's hash", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(found);

    const identity = await getUserFromApiToken(SECRET);

    expect(core.findActiveApiToken).toHaveBeenCalledWith(`hash(${SECRET})`);
    expect(identity?.user.id).toBe("member-1");
    expect(identity?.token).toEqual({
      id: "token-1",
      scopes: ["hearts:write"],
    });
  });

  it("records the use without making the request wait on it", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(found);

    await getUserFromApiToken(SECRET);

    expect(core.touchApiToken).toHaveBeenCalledWith("token-1");
  });

  it("still authenticates when recording the use fails", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(found);
    vi.mocked(core.touchApiToken).mockRejectedValue(new Error("db down"));

    await expect(getUserFromApiToken(SECRET)).resolves.not.toBeNull();
  });

  /** findActiveApiToken filters revoked and expired rows in SQL, so all three
   * arrive here as "no such active token" — and none of them may authenticate. */
  it("returns null for unknown, revoked, or expired tokens", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(null);

    await expect(getUserFromApiToken(SECRET)).resolves.toBeNull();
    expect(core.touchApiToken).not.toHaveBeenCalled();
  });
});

/**
 * The bypass-proof half of per-token rate limiting (hardening pass adopting
 * #273): the budget is charged AFTER the hash lookup succeeds, keyed by the
 * token's row id. The pre-auth middleware buckets strictly by IP, so a fake
 * `tpk_` string can neither mint a bucket nor dodge the IP limit.
 */
describe("per-token request budget", () => {
  function trackedStore() {
    const store = createMemoryRateLimitStore(60_000);
    const keys: string[] = [];
    return {
      keys,
      store: {
        hit(key: string, now: number) {
          keys.push(key);
          return store.hit(key, now);
        },
      },
    };
  }

  it("blocks an authenticated token once its budget is spent", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(found);
    const budget = createTokenRequestBudget({
      store: createMemoryRateLimitStore(60_000),
      max: 2,
    });

    await expect(getUserFromApiToken(SECRET, budget)).resolves.not.toBeNull();
    await expect(getUserFromApiToken(SECRET, budget)).resolves.not.toBeNull();
    await expect(getUserFromApiToken(SECRET, budget)).rejects.toMatchObject({
      message: expect.stringContaining("Rate limit reached for this token"),
      extensions: expect.objectContaining({ code: "RATE_LIMITED" }),
    });
  });

  it("keys the bucket by the token's row id, never the presented string", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(found);
    const { keys, store } = trackedStore();

    await getUserFromApiToken(SECRET, createTokenRequestBudget({ store }));

    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain(":token-budget:token-1");
    expect(keys[0]).not.toContain(SECRET);
  });

  it("never charges any bucket for a string that failed authentication", async () => {
    vi.mocked(core.findActiveApiToken).mockResolvedValue(null);
    const { keys, store } = trackedStore();

    await expect(
      getUserFromApiToken(SECRET, createTokenRequestBudget({ store })),
    ).resolves.toBeNull();

    expect(keys).toHaveLength(0);
  });
});
