import { describe, expect, it } from "vitest";

import {
  API_TOKEN_SCOPES,
  isTokenScope,
  normalizeScopes,
  SCOPE_LABELS,
} from "./apiTokens";
import { createApiTokenSchema } from "./validation";

describe("isTokenScope", () => {
  it("accepts every published scope", () => {
    for (const scope of API_TOKEN_SCOPES) {
      expect(isTokenScope(scope)).toBe(true);
    }
  });

  it("rejects unknown scopes and near-misses", () => {
    expect(isTokenScope("moderate:write")).toBe(false);
    expect(isTokenScope("hearts")).toBe(false);
    expect(isTokenScope("hearts:read")).toBe(false);
    expect(isTokenScope("")).toBe(false);
  });
});

describe("normalizeScopes", () => {
  it("drops unrecognised scopes rather than passing them through", () => {
    expect(normalizeScopes(["hearts:write", "forum:destroy"])).toEqual([
      "hearts:write",
    ]);
  });

  it("deduplicates and returns canonical order", () => {
    expect(
      normalizeScopes(["comments:write", "hearts:write", "comments:write"]),
    ).toEqual(["hearts:write", "comments:write"]);
  });

  it("returns an empty list for a read-only token", () => {
    expect(normalizeScopes([])).toEqual([]);
  });
});

describe("SCOPE_LABELS", () => {
  it("labels every scope — the form renders straight from this map", () => {
    for (const scope of API_TOKEN_SCOPES) {
      expect(SCOPE_LABELS[scope]?.label).toBeTruthy();
      expect(SCOPE_LABELS[scope]?.description).toBeTruthy();
    }
  });
});

describe("createApiTokenSchema", () => {
  it("accepts a named token with scopes and an expiry", () => {
    const result = createApiTokenSchema.safeParse({
      name: "triage deck",
      scopes: ["hearts:write", "feed:write"],
      expiresInDays: 90,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a read-only token (no scopes) and a never-expiring one", () => {
    expect(
      createApiTokenSchema.safeParse({
        name: "reader",
        scopes: [],
        expiresInDays: null,
      }).success,
    ).toBe(true);
  });

  it("requires a name", () => {
    expect(
      createApiTokenSchema.safeParse({ name: "", scopes: [] }).success,
    ).toBe(false);
  });

  it("rejects an unknown scope instead of silently dropping it", () => {
    expect(
      createApiTokenSchema.safeParse({
        name: "sneaky",
        scopes: ["moderate:write"],
      }).success,
    ).toBe(false);
  });
});
