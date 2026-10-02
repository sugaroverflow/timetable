import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable stand-in for @/env so each test can vary the values (the real
// module snapshots process.env at import).
const fakeEnv = {
  apiUrl: "http://localhost:4000",
  clerkPublishableKey: "",
};
vi.mock("@/env", () => ({ env: fakeEnv }));

const { buildCsp, clerkFrontendOrigin, mintNonce } = await import("./csp");

beforeEach(() => {
  fakeEnv.apiUrl = "http://localhost:4000";
  fakeEnv.clerkPublishableKey = "";
});

describe("clerkFrontendOrigin", () => {
  it("decodes the frontend-API domain out of a publishable key", () => {
    // pk_test_ + base64("<domain>$") is Clerk's key format.
    fakeEnv.clerkPublishableKey = `pk_test_${btoa("foo-bar-1.clerk.accounts.dev$")}`;
    expect(clerkFrontendOrigin()).toBe("https://foo-bar-1.clerk.accounts.dev");
  });

  it("returns null for missing or malformed keys", () => {
    expect(clerkFrontendOrigin()).toBeNull();
    fakeEnv.clerkPublishableKey = "not-a-key";
    expect(clerkFrontendOrigin()).toBeNull();
  });
});

describe("buildCsp", () => {
  it("builds a strict-dynamic script policy carrying the nonce", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    // Styles stay unsafe-inline by design (inline style attributes app-wide).
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("includes the API origin in connect-src", () => {
    fakeEnv.apiUrl = "https://topic.forum";
    expect(buildCsp("n")).toContain("connect-src 'self' https://topic.forum");
  });

  it("allows the direct-to-Spaces upload PUT in connect-src", () => {
    // ImageUploadField PUTs presigned Spaces URLs from the browser — a
    // connect-src miss blocks every image upload (prod, 2026-08-18).
    const connect = buildCsp("n")
      .split("; ")
      .find((d) => d.startsWith("connect-src"));
    expect(connect).toContain("https://*.digitaloceanspaces.com");
  });
});

describe("mintNonce", () => {
  it("mints unique base64 nonces", () => {
    const a = mintNonce();
    const b = mintNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
