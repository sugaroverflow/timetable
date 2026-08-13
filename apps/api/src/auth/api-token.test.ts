import { beforeEach, describe, expect, it, vi } from "vitest";

import {
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
