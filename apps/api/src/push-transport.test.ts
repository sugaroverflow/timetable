import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  verify,
} from "node:crypto";
import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { parsePushEnv, type PushConfig } from "./push-config";
import {
  encryptPushPayload,
  parseRetryAfter,
  PUSH_MAX_PAYLOAD_BYTES,
  PushPayloadError,
  sendPush,
  validPushEndpoint,
  vapidAuthorization,
} from "./push-transport";

/**
 * RFC 8291 §5 ("Push Message Encryption Example"), every value as published.
 * These are the RFC's own test keys, not anyone's real key material.
 */
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

const b64 = (value: string) => Buffer.from(value, "base64url");

/** The browser's side of RFC 8291, written independently of the encryptor,
 * so a round trip checks the derivation rather than echoing it. */
function decryptAsBrowser(
  body: Buffer,
  uaPrivate: Buffer,
  authSecret: Buffer,
): string {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  expect(rs).toBe(4096);
  const ua = createECDH("prime256v1");
  ua.setPrivateKey(uaPrivate);
  const secret = ua.computeSecret(asPublic);
  const info = (label: string, ...parts: Buffer[]) =>
    Buffer.concat([Buffer.from(`${label}\0`), ...parts]);
  const ikm = Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      authSecret,
      info("WebPush: info", ua.getPublicKey(), asPublic),
      32,
    ),
  );
  const key = (label: string, length: number) =>
    Buffer.from(hkdfSync("sha256", ikm, salt, info(label), length));
  const decipher = createDecipheriv(
    "aes-128-gcm",
    key("Content-Encoding: aes128gcm", 16),
    key("Content-Encoding: nonce", 12),
  );
  decipher.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([
    decipher.update(ciphertext.subarray(0, -16)),
    decipher.final(),
  ]);
  expect(padded.at(-1)).toBe(0x02); // last-record delimiter
  return padded.subarray(0, -1).toString("utf8");
}

/** A fresh, throwaway VAPID pair per test run — never a committed key. */
function testConfig(): PushConfig {
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  const { config } = parsePushEnv({
    VAPID_PUBLIC_KEY: pair.getPublicKey().toString("base64url"),
    VAPID_PRIVATE_KEY: pair.getPrivateKey().toString("base64url"),
    VAPID_SUBJECT: "mailto:push@example.com",
  });
  if (!config) throw new Error("test config did not parse");
  return config;
}

/** A browser subscription with runtime-generated keys. */
function testSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/d") {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  return {
    target: {
      endpoint,
      p256dh: ua.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    },
    uaPrivate: ua.getPrivateKey(),
    auth,
  };
}

describe("RFC 8291 payload encryption", () => {
  it("reproduces the RFC 8291 §5 example byte for byte", () => {
    const body = encryptPushPayload(
      RFC.plaintext,
      { p256dh: RFC.uaPublic, auth: RFC.authSecret },
      { salt: b64(RFC.salt), serverPrivateKey: b64(RFC.asPrivate) },
    );
    expect(body.toString("base64url")).toBe(RFC.body);
    // The header carries the server's public key as the keyid.
    expect(body.subarray(21, 86).toString("base64url")).toBe(RFC.asPublic);
  });

  it("the RFC's user agent decrypts the RFC's message", () => {
    expect(
      decryptAsBrowser(b64(RFC.body), b64(RFC.uaPrivate), b64(RFC.authSecret)),
    ).toBe(RFC.plaintext);
  });

  it("round-trips through a fresh key pair and salt every time", () => {
    const { target, uaPrivate, auth } = testSubscription();
    const text = '{"title":"Ada in Lounge","body":"héllo ❤️"}';
    const a = encryptPushPayload(text, target);
    const b = encryptPushPayload(text, target);
    expect(decryptAsBrowser(a, uaPrivate, auth)).toBe(text);
    expect(decryptAsBrowser(b, uaPrivate, auth)).toBe(text);
    expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false); // salt
    expect(a.subarray(21, 86).equals(b.subarray(21, 86))).toBe(false); // key
  });

  it("refuses a payload over the 3 KB cap", () => {
    const { target } = testSubscription();
    expect(() =>
      encryptPushPayload("x".repeat(PUSH_MAX_PAYLOAD_BYTES), target),
    ).not.toThrow();
    expect(() =>
      encryptPushPayload("x".repeat(PUSH_MAX_PAYLOAD_BYTES + 1), target),
    ).toThrow(PushPayloadError);
  });

  it.each([
    ["p256dh too short", { p256dh: "BCVx", auth: RFC.authSecret }],
    ["auth wrong length", { p256dh: RFC.uaPublic, auth: "AAAA" }],
    ["not base64url", { p256dh: `${RFC.uaPublic}!`, auth: RFC.authSecret }],
    [
      "compressed point prefix",
      {
        p256dh: Buffer.concat([
          Buffer.from([0x03]),
          b64(RFC.uaPublic).subarray(1),
        ]).toString("base64url"),
        auth: RFC.authSecret,
      },
    ],
    [
      "not on the curve",
      {
        p256dh: Buffer.concat([
          Buffer.from([0x04]),
          Buffer.alloc(64, 1),
        ]).toString("base64url"),
        auth: RFC.authSecret,
      },
    ],
  ])("refuses malformed subscription keys: %s", (_label, keys) => {
    expect(() => encryptPushPayload("hi", keys)).toThrow(PushPayloadError);
  });
});

describe("push-service endpoint allowlist", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/id",
    "https://fcm.googleapis.com/wp/id",
    "https://updates.push.services.mozilla.com/wpush/v2/id",
    "https://web.push.apple.com/id",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
    "https://db5p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["plain http", "http://fcm.googleapis.com/send/id"],
    ["IP literal", "https://127.0.0.1/push"],
    ["lookalike suffix", "https://fcm.googleapis.com.evil.test/push"],
    ["apple label prefix", "https://evilpush.apple.com/push"],
    ["windows label prefix", "https://evilnotify.windows.com/w/?token=x"],
    ["windows apex", "https://notify.windows.com/w/?token=x"],
    ["windows lookalike", "https://wns2.notify.windows.com.evil.test/w/"],
    ["credentials", "https://user:password@fcm.googleapis.com/push"],
    ["custom port", "https://fcm.googleapis.com:444/push"],
    ["fragment", "https://fcm.googleapis.com/push#fragment"],
    ["bare origin", "https://fcm.googleapis.com/"],
    ["unknown host", "https://example.com/push"],
    ["too long", `https://fcm.googleapis.com/${"a".repeat(2048)}`],
    ["not a URL", "fcm.googleapis.com/push"],
    ["not a string", null],
  ])("rejects %s", (_label, endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(false);
  });
});

describe("RFC 8292 VAPID authorization", () => {
  it("signs an audience-bound ES256 JWT that expires in one hour", () => {
    const config = testConfig();
    const now = 1_700_000_000_000;
    const header = vapidAuthorization(
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      config,
      now,
    );
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, token, k] = match!;
    expect(k).toBe(config.publicKey);
    const [head, body, signature] = token!.split(".");
    expect(JSON.parse(b64(head!).toString())).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    expect(JSON.parse(b64(body!).toString())).toEqual({
      aud: "https://wns2-par02p.notify.windows.com",
      exp: now / 1000 + 3600,
      sub: "mailto:push@example.com",
    });
    const pub = b64(config.publicKey);
    const key = createPublicKey({
      format: "jwk",
      key: {
        kty: "EC",
        crv: "P-256",
        x: pub.subarray(1, 33).toString("base64url"),
        y: pub.subarray(33).toString("base64url"),
      },
    });
    const sig = b64(signature!);
    expect(sig).toHaveLength(64); // raw r||s, not DER
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key, dsaEncoding: "ieee-p1363" },
        sig,
      ),
    ).toBe(true);
  });

  it("puts no private key material in the header", () => {
    const config = testConfig();
    const d = config.signingKey.export({ format: "jwk" }).d!;
    expect(
      vapidAuthorization("https://fcm.googleapis.com/x", config),
    ).not.toContain(d);
  });
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds and HTTP-dates", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(parseRetryAfter("120", now)).toBe(120);
    expect(parseRetryAfter("Sat, 03 Oct 2026 12:01:30 GMT", now)).toBe(90);
    expect(parseRetryAfter("Sat, 03 Oct 2026 11:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter(["30", "60"], now)).toBe(30);
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});

type FakeResponse = { statusCode: number; headers?: Record<string, string> };

/** Stand-in for node:https `request`: answers with `response`, or fails
 * with a network error, or never answers at all. No real push is sent. */
function fakeRequest(
  behaviour: FakeResponse | "network-error" | "hang",
  written: Buffer[] = [],
) {
  mocks.request.mockImplementation((_url, _options, callback) => {
    const req = Object.assign(new EventEmitter(), {
      end(this: EventEmitter, chunk?: Buffer) {
        if (chunk) written.push(chunk);
        if (behaviour === "hang") return;
        if (behaviour === "network-error") {
          this.emit("error", new Error("connect ECONNREFUSED <endpoint>"));
          return;
        }
        callback({
          statusCode: behaviour.statusCode,
          headers: behaviour.headers ?? {},
          resume: vi.fn(),
        });
      },
      destroy(this: EventEmitter) {
        this.emit("error", new Error("socket hang up"));
      },
    });
    return req;
  });
}

describe("sendPush outcomes (network mocked)", () => {
  beforeEach(() => mocks.request.mockReset());
  afterEach(() => vi.useRealTimers());

  it("POSTs an encrypted aes128gcm body with VAPID, TTL and Urgency", async () => {
    const config = testConfig();
    const { target, uaPrivate, auth } = testSubscription();
    const written: Buffer[] = [];
    fakeRequest({ statusCode: 201 }, written);
    const payload = '{"title":"Joshua Becker in Faculty Lounge"}';

    const result = await sendPush(target, payload, config, {
      urgency: "high",
    });

    expect(result).toEqual({ outcome: "ok", status: 201 });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.request.mock.calls[0]!;
    expect(url).toBe(target.endpoint);
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      TTL: "3600",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(written[0]!.length),
    });
    expect(options.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(decryptAsBrowser(written[0]!, uaPrivate, auth)).toBe(payload);
    expect(written[0]!.includes(Buffer.from(payload))).toBe(false);
  });

  it.each([
    [200, { outcome: "ok", status: 200 }],
    [404, { outcome: "gone", status: 404 }],
    [410, { outcome: "gone", status: 410 }],
    [
      503,
      {
        outcome: "retryable",
        status: 503,
        reason: "server-error",
        retryAfterSeconds: null,
      },
    ],
    [302, { outcome: "rejected", status: 302, reason: "refused" }],
    [400, { outcome: "rejected", status: 400, reason: "refused" }],
    [403, { outcome: "rejected", status: 403, reason: "refused" }],
    [413, { outcome: "rejected", status: 413, reason: "refused" }],
  ])("maps HTTP %s", async (statusCode, expected) => {
    fakeRequest({ statusCode });
    const { target } = testSubscription();
    expect(
      await sendPush(target, "{}", testConfig(), { urgency: "normal" }),
    ).toEqual(expected);
  });

  it("reports 429 as rate-limited with Retry-After", async () => {
    fakeRequest({ statusCode: 429, headers: { "retry-after": "42" } });
    const { target } = testSubscription();
    expect(
      await sendPush(target, "{}", testConfig(), { urgency: "normal" }),
    ).toEqual({ outcome: "rate-limited", status: 429, retryAfterSeconds: 42 });
  });

  it("reports a network failure as retryable, without the error text", async () => {
    fakeRequest("network-error");
    const { target } = testSubscription();
    const result = await sendPush(target, "{}", testConfig(), {
      urgency: "normal",
    });
    expect(result).toEqual({
      outcome: "retryable",
      status: null,
      reason: "network",
      retryAfterSeconds: null,
    });
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
  });

  it("gives up at the deadline and reports a timeout", async () => {
    vi.useFakeTimers();
    fakeRequest("hang");
    const { target } = testSubscription();
    const pending = sendPush(target, "{}", testConfig(), {
      urgency: "normal",
      timeoutMs: 5000,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({
      outcome: "retryable",
      status: null,
      reason: "timeout",
      retryAfterSeconds: null,
    });
  });

  it("refuses an untrusted endpoint before any network request", async () => {
    const { target } = testSubscription("https://127.0.0.1/private");
    expect(
      await sendPush(target, "{}", testConfig(), { urgency: "normal" }),
    ).toEqual({
      outcome: "rejected",
      status: null,
      reason: "invalid-endpoint",
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("refuses bad subscription keys and oversized payloads before sending", async () => {
    const config = testConfig();
    const { target } = testSubscription();
    expect(
      await sendPush({ ...target, auth: "AAAA" }, "{}", config, {
        urgency: "normal",
      }),
    ).toEqual({ outcome: "rejected", status: null, reason: "invalid-keys" });
    expect(
      await sendPush(target, "x".repeat(PUSH_MAX_PAYLOAD_BYTES + 1), config, {
        urgency: "normal",
      }),
    ).toEqual({
      outcome: "rejected",
      status: null,
      reason: "payload-too-large",
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
