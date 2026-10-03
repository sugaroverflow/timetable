import { createECDH, createPublicKey, sign, verify } from "node:crypto";
import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { loadPushConfig, parsePushEnv } from "./push-config";
import { vapidTestPair } from "./push-test-keys";

const pair = vapidTestPair;

function valid(extra: Record<string, string> = {}) {
  return { ...pair(), VAPID_SUBJECT: "mailto:push@example.com", ...extra };
}

function load(source: Record<string, string | undefined>, isProd: boolean) {
  const warn = vi.fn();
  const run = () => loadPushConfig(source, { isProd, warn });
  return { run, warn };
}

describe("Web Push boot rule (plan §3.1)", () => {
  it.each([
    ["unset", {}],
    [
      "all empty — a spec placeholder whose secret is missing",
      { VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" },
    ],
    [
      "all whitespace",
      { VAPID_PUBLIC_KEY: " ", VAPID_PRIVATE_KEY: "\n", VAPID_SUBJECT: "" },
    ],
    [
      "all empty with the kill switch set",
      {
        VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        VAPID_SUBJECT: "",
        PUSH_PAUSED: "true",
      },
    ],
  ])("%s: push is off, silently, even in production", (_label, source) => {
    for (const isProd of [true, false]) {
      const { run, warn } = load(source, isProd);
      expect(run()).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it("all three valid: a frozen config with the canonical public key", () => {
    const source = valid();
    const { run, warn } = load(source, true);
    const config = run();
    expect(config).not.toBeNull();
    expect(Object.isFrozen(config)).toBe(true);
    expect(config!.publicKey).toBe(source.VAPID_PUBLIC_KEY);
    expect(config!.subject).toBe("mailto:push@example.com");
    expect(config!.paused).toBe(false);
    expect(config!.signingKey.asymmetricKeyType).toBe("ec");
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts an https:// subject and padded base64url", () => {
    const keys = pair();
    const { config, problem } = parsePushEnv({
      VAPID_PUBLIC_KEY: `${keys.VAPID_PUBLIC_KEY}=`,
      VAPID_PRIVATE_KEY: `${keys.VAPID_PRIVATE_KEY}=`,
      VAPID_SUBJECT: "https://topic.forum/contact",
    });
    expect(problem).toBeNull();
    expect(config!.publicKey).toBe(keys.VAPID_PUBLIC_KEY);
  });

  it("never prints the private key, even if the config is logged", () => {
    const source = valid();
    const config = parsePushEnv(source).config!;
    expect(inspect(config, { depth: 5 })).not.toContain(
      source.VAPID_PRIVATE_KEY,
    );
    expect(JSON.stringify(config)).not.toContain(source.VAPID_PRIVATE_KEY);
  });

  const broken: Array<[string, Record<string, string>, RegExp]> = [
    [
      "only the private key",
      { VAPID_PRIVATE_KEY: pair().VAPID_PRIVATE_KEY },
      /half-configured: VAPID_PRIVATE_KEY set but VAPID_PUBLIC_KEY, VAPID_SUBJECT not/,
    ],
    [
      "keys without a subject",
      { ...pair(), VAPID_SUBJECT: "" },
      /half-configured: .* but VAPID_SUBJECT not/,
    ],
    [
      "a subject that is neither mailto: nor https://",
      valid({ VAPID_SUBJECT: "push@example.com" }),
      /VAPID_SUBJECT must start with mailto: or https:\/\//,
    ],
    [
      "an http:// subject",
      valid({ VAPID_SUBJECT: "http://example.com" }),
      /VAPID_SUBJECT must start with/,
    ],
    [
      "a mailto: without an address",
      valid({ VAPID_SUBJECT: "mailto:" }),
      /mailto: without an email address/,
    ],
    [
      "a public key of the wrong length",
      valid({ VAPID_PUBLIC_KEY: "BCVxsr7N" }),
      /VAPID_PUBLIC_KEY must be base64url of a 65-byte/,
    ],
    [
      "a public key that is not base64url",
      valid({ VAPID_PUBLIC_KEY: "not/base64+url" }),
      /VAPID_PUBLIC_KEY must be base64url/,
    ],
    [
      "a private key longer than 32 bytes",
      valid({ VAPID_PRIVATE_KEY: Buffer.alloc(33, 1).toString("base64url") }),
      /VAPID_PRIVATE_KEY must be base64url of 32 bytes/,
    ],
    [
      "a short private key that pads to zero",
      valid({ VAPID_PRIVATE_KEY: "AAAA" }),
      /VAPID_PRIVATE_KEY is not a P-256 key/,
    ],
    [
      "a zero private key",
      valid({ VAPID_PRIVATE_KEY: Buffer.alloc(32).toString("base64url") }),
      /VAPID_PRIVATE_KEY is not a P-256 key/,
    ],
    [
      "keys from two different pairs",
      { ...valid(), VAPID_PUBLIC_KEY: pair().VAPID_PUBLIC_KEY },
      /not the public half of VAPID_PRIVATE_KEY/,
    ],
  ];

  it.each(broken)(
    "%s: refuses to boot in production",
    (_label, source, message) => {
      const { run } = load(source, true);
      expect(run).toThrow(message);
    },
  );

  it.each(broken)(
    "%s: warns and stays off outside production",
    (_label, source, message) => {
      const { run, warn } = load(source, false);
      expect(run()).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toMatch(message);
      expect(warn.mock.calls[0]![0]).toMatch(/Web Push is off$/);
    },
  );

  it("never echoes a key value in a boot error", () => {
    const keys = valid();
    const other = pair();
    const { run } = load(
      { ...keys, VAPID_PUBLIC_KEY: other.VAPID_PUBLIC_KEY },
      true,
    );
    try {
      run();
      expect.unreachable();
    } catch (err) {
      const text = String(err);
      expect(text).not.toContain(keys.VAPID_PRIVATE_KEY);
      expect(text).not.toContain(other.VAPID_PUBLIC_KEY);
    }
  });

  describe("PUSH_PAUSED", () => {
    it.each([
      [undefined, false],
      ["", false],
      ["false", false],
      ["0", false],
      ["true", true],
      ["TRUE", true],
      ["1", true],
    ])("%s → paused %s", (value, paused) => {
      const { run, warn } = load(valid({ PUSH_PAUSED: value ?? "" }), true);
      expect(run()!.paused).toBe(paused);
      expect(warn).not.toHaveBeenCalled();
    });

    it("reads an unrecognised value as paused, and says so", () => {
      const { run, warn } = load(valid({ PUSH_PAUSED: "yes please" }), true);
      expect(run()!.paused).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/PUSH_PAUSED has an unrecognised value/),
      );
    });
  });

  it("accepts a private key whose leading zero byte was dropped (31 bytes)", () => {
    // Deterministic: a fixed scalar (a test constant, nobody's key) whose
    // first byte is 0x00, given the way getPrivateKey() hands it out.
    const scalar = Buffer.from(`00${"11".repeat(31)}`, "hex");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(scalar);
    const short = scalar.subarray(1); // what getPrivateKey() hands out
    expect(short).toHaveLength(31);
    const { config, problem } = parsePushEnv({
      VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
      VAPID_PRIVATE_KEY: short.toString("base64url"),
      VAPID_SUBJECT: "mailto:push@example.com",
    });
    expect(problem).toBeNull();
    expect(
      Buffer.from(
        config!.signingKey.export({ format: "jwk" }).d!,
        "base64url",
      ).equals(scalar),
    ).toBe(true);
    // And it signs a JWT that verifies against the public key.
    const sig = sign("sha256", Buffer.from("x"), {
      key: config!.signingKey,
      dsaEncoding: "ieee-p1363",
    });
    expect(
      verify(
        "sha256",
        Buffer.from("x"),
        {
          key: createPublicKey({
            format: "jwk",
            key: {
              kty: "EC",
              crv: "P-256",
              x: ecdh.getPublicKey().subarray(1, 33).toString("base64url"),
              y: ecdh.getPublicKey().subarray(33).toString("base64url"),
            },
          }),
          dsaEncoding: "ieee-p1363",
        },
        sig,
      ),
    ).toBe(true);
  });
});
