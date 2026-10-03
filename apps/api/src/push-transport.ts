import {
  createCipheriv,
  createECDH,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";
import { request } from "node:https";

import type { PushConfig } from "./push-config";

/**
 * Web Push transport (docs/web-push-plan.md §2, step 2 of §6): endpoint
 * allowlist, RFC 8291 payload encryption, RFC 8292 VAPID signing, and one
 * HTTP send with a typed outcome for the sweep (step 3) to record.
 *
 * Everything is `node:crypto` + `node:https` — no new dependency (plan §2).
 * The whole of RFC 8291 for a single record is ECDH + two HKDFs + one
 * AES-128-GCM call; a library would add a supply-chain surface that holds
 * our signing key, for about sixty lines of code that the RFC's own worked
 * example pins down byte for byte (see push-transport.test.ts).
 *
 * Logging rule: nothing here logs. Endpoints, payload keys and the signing
 * key are each as sensitive as a password (plan §3.1), and Node's network
 * error messages can carry the endpoint's URL — so errors become outcomes,
 * never messages.
 */

// ---------------------------------------------------------------------------
// Endpoint allowlist
// ---------------------------------------------------------------------------

/** Exact push-service hosts. */
const PUSH_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Android, Opera, Samsung Internet
  "updates.push.services.mozilla.com", // Firefox
]);

/** Push services that hand out per-region subdomains. A suffix match on the
 * whole label, so `evilpush.apple.com` / `evilnotify.windows.com` fail. */
const PUSH_HOST_SUFFIXES = [
  ".push.apple.com", // Safari (macOS 13+, iOS/iPadOS 16.4+ home-screen apps)
  ".notify.windows.com", // Edge (WNS: wns2-xxx.notify.windows.com)
];

/**
 * A fixed provider allowlist keeps subscription endpoints from turning the
 * API into an SSRF proxy: HTTPS only, no custom port, no credentials, no
 * fragment, no bare origin, no IP literals or local hosts (none can match).
 */
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname;
  const allowed =
    PUSH_HOSTS.has(host) ||
    PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  return (
    allowed &&
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.hash === "" &&
    url.pathname !== "/"
  );
}

// ---------------------------------------------------------------------------
// RFC 8291 payload encryption (aes128gcm, RFC 8188)
// ---------------------------------------------------------------------------

/** The plan keeps payloads under 3 KB; the protocol's ceiling is 4096 bytes
 * of ciphertext, which one record of our size always fits. */
export const PUSH_MAX_PAYLOAD_BYTES = 3072;
/** RFC 8188 record size. One record holds any payload under the cap. */
const RECORD_SIZE = 4096;

/** The browser's keys from `PushSubscription.getKey()`, base64url. */
export interface PushSubscriptionKeys {
  /** The user agent's ECDH public key: a 65-byte uncompressed P-256 point. */
  p256dh: string;
  /** The 16-byte authentication secret. */
  auth: string;
}

export interface PushSubscriptionTarget extends PushSubscriptionKeys {
  endpoint: string;
}

/** Fixed inputs, for the RFC test vector only. Production always draws a
 * fresh ephemeral key pair and salt per message (RFC 8291 §3.4 requires it). */
export interface EncryptionFixture {
  salt: Buffer;
  /** The application server's ephemeral ECDH private key, 32 bytes. */
  serverPrivateKey: Buffer;
}

export class PushPayloadError extends Error {
  constructor(readonly reason: "invalid-keys" | "payload-too-large") {
    super(
      reason === "invalid-keys"
        ? "Push subscription keys are malformed"
        : `Push payload exceeds ${PUSH_MAX_PAYLOAD_BYTES} bytes`,
    );
    this.name = "PushPayloadError";
  }
}

function decodeKey(value: string, length: number): Buffer {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    throw new PushPayloadError("invalid-keys");
  }
  const bytes = Buffer.from(value.replace(/=+$/, ""), "base64url");
  if (bytes.length !== length) throw new PushPayloadError("invalid-keys");
  return bytes;
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number) {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

/**
 * Encrypt `plaintext` for one subscription (RFC 8291 §3.4 + RFC 8188):
 *
 *   ecdh_secret = ECDH(as_private, ua_public)
 *   IKM   = HKDF(salt = auth_secret, ecdh_secret,
 *                "WebPush: info" 0x00 ua_public as_public, 32)
 *   CEK   = HKDF(salt, IKM, "Content-Encoding: aes128gcm" 0x00, 16)
 *   NONCE = HKDF(salt, IKM, "Content-Encoding: nonce" 0x00, 12)
 *   body  = salt(16) | rs(4, BE) | idlen(1) = 65 | as_public(65)
 *           | AES-128-GCM(CEK, NONCE, plaintext | 0x02) | tag(16)
 *
 * One record, no padding beyond the 0x02 last-record delimiter.
 */
export function encryptPushPayload(
  plaintext: string | Uint8Array,
  keys: PushSubscriptionKeys,
  fixture?: EncryptionFixture,
): Buffer {
  const message =
    typeof plaintext === "string"
      ? Buffer.from(plaintext, "utf8")
      : Buffer.from(plaintext);
  if (message.length > PUSH_MAX_PAYLOAD_BYTES) {
    throw new PushPayloadError("payload-too-large");
  }
  const uaPublic = decodeKey(keys.p256dh, 65);
  const authSecret = decodeKey(keys.auth, 16);
  if (uaPublic[0] !== 0x04) throw new PushPayloadError("invalid-keys");

  const server = createECDH("prime256v1");
  if (fixture) server.setPrivateKey(fixture.serverPrivateKey);
  else server.generateKeys();
  const asPublic = server.getPublicKey();
  let ecdhSecret: Buffer;
  try {
    ecdhSecret = server.computeSecret(uaPublic);
  } catch {
    // Not a point on the curve.
    throw new PushPayloadError("invalid-keys");
  }
  const salt = fixture?.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "latin1"),
    uaPublic,
    asPublic,
  ]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(
    salt,
    ikm,
    Buffer.from("Content-Encoding: aes128gcm\0", "latin1"),
    16,
  );
  const nonce = hkdf(
    salt,
    ikm,
    Buffer.from("Content-Encoding: nonce\0", "latin1"),
    12,
  );

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(message),
    cipher.update(Buffer.from([0x02])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext]);
}

// ---------------------------------------------------------------------------
// RFC 8292 VAPID
// ---------------------------------------------------------------------------

/** JWT lifetime. RFC 8292 caps it at 24 h; one hour is plenty for a token
 * minted per request. */
export const VAPID_JWT_TTL_SECONDS = 3600;

/** `Authorization: vapid t=<ES256 JWT>, k=<public key>`, audience-bound to
 * the push service's origin. */
export function vapidAuthorization(
  endpoint: string,
  config: Pick<PushConfig, "publicKey" | "signingKey" | "subject">,
  now: number = Date.now(),
): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + VAPID_JWT_TTL_SECONDS,
    sub: config.subject,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: config.signingKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `vapid t=${unsigned}.${signature}, k=${config.publicKey}`;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** How long a queued message may wait at the push service for an offline
 * device (plan §2). Alerts are for now; the pane and digest keep the rest. */
export const PUSH_TTL_SECONDS = 3600;
/** Wall-clock deadline per send, DNS and TLS included (#360). */
export const PUSH_SEND_TIMEOUT_MS = 5000;

export type PushUrgency = "high" | "normal";

/**
 * What one send came to, for the sweep to record (plan §3.2 step 6):
 * - `ok`: accepted (2xx). Stamp `last_sent_at`, reset `failure_count`.
 * - `gone`: 404/410, the subscription has expired or been revoked. Delete it.
 * - `rate-limited`: 429, with Retry-After in seconds when the service sent it.
 * - `retryable`: 5xx, timeout or network failure. Bump `failure_count`.
 * - `rejected`: we could not or should not send — a refused endpoint, bad
 *   payload keys or an oversized payload (nothing went on the wire), or any
 *   other status the service answered (3xx, 400, 403, 413…).
 */
export type PushSendResult =
  | { outcome: "ok"; status: number }
  | { outcome: "gone"; status: 404 | 410 }
  | { outcome: "rate-limited"; status: 429; retryAfterSeconds: number | null }
  | {
      outcome: "retryable";
      status: number | null;
      reason: "server-error" | "timeout" | "network";
      retryAfterSeconds: number | null;
    }
  | {
      outcome: "rejected";
      status: number | null;
      reason:
        | "invalid-endpoint"
        | "invalid-keys"
        | "payload-too-large"
        | "refused";
    };

export interface SendPushOptions {
  /** `high` for the on-by-default (aimed at you) kinds, `normal` for the
   * rest (plan §2). */
  urgency: PushUrgency;
  ttlSeconds?: number;
  timeoutMs?: number;
  /** Clock for the JWT, injectable for tests. */
  now?: number;
}

/** Retry-After is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3). */
export function parseRetryAfter(
  header: string | string[] | undefined,
  now: number = Date.now(),
): number | null {
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function classifyStatus(
  status: number,
  retryAfter: string | string[] | undefined,
): PushSendResult {
  if (status >= 200 && status < 300) return { outcome: "ok", status };
  if (status === 404 || status === 410) return { outcome: "gone", status };
  if (status === 429) {
    return {
      outcome: "rate-limited",
      status,
      retryAfterSeconds: parseRetryAfter(retryAfter),
    };
  }
  if (status >= 500) {
    return {
      outcome: "retryable",
      status,
      reason: "server-error",
      retryAfterSeconds: parseRetryAfter(retryAfter),
    };
  }
  return { outcome: "rejected", status, reason: "refused" };
}

/**
 * Encrypt `payload` for one device and POST it to its push service. Never
 * throws and never logs; redirects are not followed. Holds no database
 * connection — the sweep calls it after committing (plan §2 finding 3).
 *
 * PUSH_PAUSED is the CALLER's check (the sweep advances its cursor and sends
 * nothing); this function sends whatever it is given.
 */
export async function sendPush(
  target: PushSubscriptionTarget,
  payload: string | Uint8Array,
  config: Pick<PushConfig, "publicKey" | "signingKey" | "subject">,
  options: SendPushOptions,
): Promise<PushSendResult> {
  if (!validPushEndpoint(target.endpoint)) {
    return { outcome: "rejected", status: null, reason: "invalid-endpoint" };
  }
  let body: Buffer;
  try {
    body = encryptPushPayload(payload, target);
  } catch (err) {
    const reason =
      err instanceof PushPayloadError ? err.reason : "invalid-keys";
    return { outcome: "rejected", status: null, reason };
  }
  const headers = {
    Authorization: vapidAuthorization(target.endpoint, config, options.now),
    TTL: String(options.ttlSeconds ?? PUSH_TTL_SECONDS),
    Urgency: options.urgency,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    "Content-Length": String(body.length),
  };
  return post(target.endpoint, headers, body, options.timeoutMs);
}

function post(
  endpoint: string,
  headers: Record<string, string>,
  body: Buffer,
  timeoutMs: number = PUSH_SEND_TIMEOUT_MS,
): Promise<PushSendResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (result: PushSendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const failed = () =>
      settle({
        outcome: "retryable",
        status: null,
        reason: timedOut ? "timeout" : "network",
        retryAfterSeconds: null,
      });
    try {
      const req = request(endpoint, { method: "POST", headers }, (res) => {
        res.resume(); // drain; the body is never read or logged
        settle(classifyStatus(res.statusCode ?? 0, res.headers["retry-after"]));
      });
      // One wall-clock deadline also bounds DNS and TLS stalls.
      timer = setTimeout(() => {
        timedOut = true;
        req.destroy();
      }, timeoutMs);
      // Never log the error: its message can carry the secret endpoint.
      req.on("error", failed);
      req.end(body);
    } catch {
      failed();
    }
  });
}
