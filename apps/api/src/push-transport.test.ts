import { createECDH, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validPushEndpoint, vapidAuthorization } from "./push-transport";

describe("Web Push transport security", () => {
  it.each([
    "http://fcm.googleapis.com/send/id",
    "https://127.0.0.1/push",
    "https://fcm.googleapis.com.evil.test/push",
    "https://evilpush.apple.com/push",
    "https://user:password@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:444/push",
    "https://fcm.googleapis.com/push#fragment",
    "https://example.com/push",
    null,
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(false);
  });
  it.each([
    "https://fcm.googleapis.com/fcm/send/id",
    "https://updates.push.services.mozilla.com/wpush/v2/id",
    "https://web.push.apple.com/id",
  ])("accepts known push provider %s", (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(true);
  });
  it("signs an audience-bound ES256 JWT with a one-hour expiry", () => {
    const pair = createECDH("prime256v1");
    pair.generateKeys();
    const config = {
      publicKey: pair.getPublicKey().toString("base64url"),
      privateKey: pair.getPrivateKey().toString("base64url"),
      subject: "mailto:push@example.com",
    };
    const header = vapidAuthorization(
      "https://fcm.googleapis.com/send/id",
      config,
      1000000,
    );
    const token = header.slice("vapid t=".length).split(",")[0]!;
    const [head, body, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(body!, "base64url").toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 4600,
      sub: config.subject,
    });
    const pub = pair.getPublicKey();
    const key = createPublicKey({
      format: "jwk",
      key: {
        kty: "EC",
        crv: "P-256",
        x: pub.subarray(1, 33).toString("base64url"),
        y: pub.subarray(33).toString("base64url"),
      },
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
    expect(header).not.toContain(config.privateKey);
  });
});
