import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildContext } from "./context";

vi.mock("@timetable/core", () => ({
  getPerson: vi.fn(),
  getReadableTimetable: vi.fn(),
  getViewerRoles: vi.fn(async () => []),
  // auth/api-token pulls these in; the token resolution itself is mocked
  // below, so they only need to exist.
  API_TOKEN_PREFIX: "tpk_",
  findActiveApiToken: vi.fn(),
  hashApiToken: vi.fn(),
  touchApiToken: vi.fn(),
}));

vi.mock("./auth/clerk", () => ({
  getUserFromRequest: vi.fn(async () => null),
}));

vi.mock("./auth/api-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/api-token")>();
  return {
    ...actual,
    getUserFromApiToken: vi.fn(),
  };
});

const clerk = await import("./auth/clerk");
const apiToken = await import("./auth/api-token");

const TOKEN_HEADER = "Bearer tpk_abcdefghijklmnopqrstuvwxyz0123456789";

const tokenIdentity = {
  user: {
    id: "member-1",
    email: "member-1@example.com",
    name: "Member One",
    image: null,
  },
  token: { id: "token-1", scopes: ["hearts:write" as const] },
};

beforeEach(() => {
  vi.mocked(apiToken.getUserFromApiToken).mockReset();
  vi.mocked(apiToken.getUserFromApiToken).mockResolvedValue(tokenIdentity);
  vi.mocked(clerk.getUserFromRequest).mockReset();
  vi.mocked(clerk.getUserFromRequest).mockResolvedValue(null);
});

describe("buildContext with a personal API token", () => {
  it("resolves the token when the caller allows it (the GraphQL path)", async () => {
    const ctx = await buildContext({
      authHeader: TOKEN_HEADER,
      allowApiToken: true,
    });

    expect(ctx.user?.id).toBe("member-1");
    expect(ctx.apiToken).toEqual({ id: "token-1", scopes: ["hearts:write"] });
  });

  it("leaves the caller unauthenticated when a token can't be resolved", async () => {
    vi.mocked(apiToken.getUserFromApiToken).mockResolvedValue(null);

    const ctx = await buildContext({
      authHeader: TOKEN_HEADER,
      allowApiToken: true,
    });

    expect(ctx.user).toBeNull();
    expect(ctx.apiToken).toBeNull();
    // Never falls back to the session path — a bad token is not anonymous
    // access with a stray cookie.
    expect(clerk.getUserFromRequest).not.toHaveBeenCalled();
  });

  /**
   * The REST surface's guarantee. Scope enforcement is a GraphQL plugin that
   * never sees a REST request, so REST must not accept personal tokens at all
   * — otherwise a token scoped to nothing but hearts:write would reach invites,
   * role edits, and uploads as a fully authenticated user.
   */
  it("ignores a personal token entirely when the caller doesn't allow it (the REST path)", async () => {
    const ctx = await buildContext({ authHeader: TOKEN_HEADER });

    expect(ctx.user).toBeNull();
    expect(ctx.apiToken).toBeNull();
    expect(apiToken.getUserFromApiToken).not.toHaveBeenCalled();
  });

  it("ignores the x-view-as preview header on the token path", async () => {
    const ctx = await buildContext({
      authHeader: TOKEN_HEADER,
      viewAsHeader: "some-forum:someone-else",
      allowApiToken: true,
    });

    expect(ctx.user?.id).toBe("member-1");
    expect(ctx.impersonation).toBeNull();
  });

  it("takes the session path for a Clerk JWT even when tokens are allowed", async () => {
    vi.mocked(clerk.getUserFromRequest).mockResolvedValue({
      id: "session-user",
      email: null,
      name: null,
      image: null,
    });

    const ctx = await buildContext({
      authHeader: "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.e30.sig",
      allowApiToken: true,
    });

    expect(ctx.user?.id).toBe("session-user");
    expect(ctx.apiToken).toBeNull();
    expect(apiToken.getUserFromApiToken).not.toHaveBeenCalled();
  });
});
