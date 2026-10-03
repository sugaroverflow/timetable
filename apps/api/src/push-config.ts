import { createECDH, createPrivateKey, type KeyObject } from "node:crypto";

/**
 * Web Push server configuration (docs/web-push-plan.md §3.1), read ONCE at
 * boot by `env.ts`. Kept out of env.ts itself so the boot rule is a pure
 * function the tests can run against any set of values without re-importing
 * the module.
 *
 * The private key never leaves this module as a string: it becomes a
 * KeyObject, whose inspection and JSON forms carry no key material, so a
 * stray `console.log(env)` can't print it.
 */
export interface PushConfig {
  /** base64url (unpadded) uncompressed P-256 point, 65 bytes. Public: sent
   * to browsers through GraphQL `pushPublicKey`. */
  readonly publicKey: string;
  /** The ES256 key that signs every VAPID JWT. */
  readonly signingKey: KeyObject;
  /** `mailto:` or `https://` contact the push services may use. */
  readonly subject: string;
  /** PUSH_PAUSED kill switch: the controls stay, nothing is sent. */
  readonly paused: boolean;
}

export const PUSH_ENV_KEYS = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

type PushEnvSource = Readonly<Record<string, string | undefined>>;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function decodeBase64url(value: string): Buffer | null {
  return BASE64URL.test(value)
    ? Buffer.from(value.replace(/=+$/, ""), "base64url")
    : null;
}

function subjectProblem(subject: string): string | null {
  if (subject.startsWith("mailto:")) {
    return /^mailto:[^@\s]+@[^@\s]+$/.test(subject)
      ? null
      : "VAPID_SUBJECT is a mailto: without an email address";
  }
  if (subject.startsWith("https://")) {
    try {
      new URL(subject);
      return null;
    } catch {
      return "VAPID_SUBJECT is not a valid https:// URL";
    }
  }
  return "VAPID_SUBJECT must start with mailto: or https://";
}

type KeyCheck =
  | { ok: true; publicKey: string; signingKey: KeyObject }
  | { ok: false; problem: string };

/** Both keys decode to the right lengths, and the public key is the one the
 * private key derives — a mismatched pair would sign JWTs that every push
 * service rejects, silently, forever. */
function checkKeyPair(publicRaw: string, privateRaw: string): KeyCheck {
  const publicBytes = decodeBase64url(publicRaw);
  if (!publicBytes || publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    return {
      ok: false,
      problem:
        "VAPID_PUBLIC_KEY must be base64url of a 65-byte uncompressed P-256 point",
    };
  }
  const privateBytes = decodeBase64url(privateRaw);
  if (!privateBytes || privateBytes.length !== 32) {
    return {
      ok: false,
      problem: "VAPID_PRIVATE_KEY must be base64url of 32 bytes",
    };
  }
  const ecdh = createECDH("prime256v1");
  try {
    ecdh.setPrivateKey(privateBytes);
  } catch {
    return { ok: false, problem: "VAPID_PRIVATE_KEY is not a P-256 key" };
  }
  if (!ecdh.getPublicKey().equals(publicBytes)) {
    return {
      ok: false,
      problem:
        "VAPID_PUBLIC_KEY is not the public half of VAPID_PRIVATE_KEY (keys from two different pairs?)",
    };
  }
  const signingKey = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: privateBytes.toString("base64url"),
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
    },
  });
  return { ok: true, publicKey: publicBytes.toString("base64url"), signingKey };
}

/** "true"/"1" pause; unset, empty, "false", "0" don't. Anything else is
 * read as a pause too: a kill switch that someone typed is meant to be on. */
function readPaused(raw: string | undefined): {
  paused: boolean;
  odd: boolean;
} {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "false" || value === "0") {
    return { paused: false, odd: false };
  }
  return { paused: true, odd: value !== "true" && value !== "1" };
}

type Parsed = { config: PushConfig | null; problem: string | null };

/** Pure: what the values say, without deciding whether to throw. Values are
 * never echoed in a problem message — only variable names. */
export function parsePushEnv(source: PushEnvSource): Parsed {
  // Empty counts as unset: an app-spec placeholder whose GitHub secret is
  // missing expands to "" (digitalocean/app_action), and that alone must not
  // take the API down (the SPACES rule's lesson, PR #72).
  const values = PUSH_ENV_KEYS.map((k) => (source[k] ?? "").trim());
  const present = PUSH_ENV_KEYS.filter((_, i) => values[i] !== "");
  if (present.length === 0) return { config: null, problem: null };
  if (present.length < PUSH_ENV_KEYS.length) {
    const missing = PUSH_ENV_KEYS.filter((k) => !present.includes(k));
    return {
      config: null,
      problem: `Web Push is half-configured: ${present.join(", ")} set but ${missing.join(", ")} not`,
    };
  }
  const [publicRaw, privateRaw, subject] = values as [string, string, string];
  const badSubject = subjectProblem(subject);
  if (badSubject) return { config: null, problem: badSubject };
  const keys = checkKeyPair(publicRaw, privateRaw);
  if (!keys.ok) return { config: null, problem: keys.problem };
  const { paused } = readPaused(source.PUSH_PAUSED);
  return {
    config: Object.freeze({
      publicKey: keys.publicKey,
      signingKey: keys.signingKey,
      subject,
      paused,
    }),
    problem: null,
  };
}

/**
 * The boot rule (plan §3.1):
 * - none of the three set (or all empty) → null, silently: push is off;
 * - all three set and valid → the frozen config;
 * - partial or invalid → in production THROW, so the API refuses to boot and
 *   DigitalOcean keeps the previous deployment live (like SPACES_BUCKET
 *   without its key); elsewhere warn and return null.
 */
export function loadPushConfig(
  source: PushEnvSource,
  opts: { isProd: boolean; warn?: (message: string) => void },
): PushConfig | null {
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const { config, problem } = parsePushEnv(source);
  if (problem) {
    const message = `[api] ${problem}`;
    if (opts.isProd) throw new Error(message);
    warn(`${message} — Web Push is off`);
    return null;
  }
  if (config && readPaused(source.PUSH_PAUSED).odd) {
    warn(
      "[api] PUSH_PAUSED has an unrecognised value; treating it as paused (use true or false)",
    );
  }
  return config;
}
