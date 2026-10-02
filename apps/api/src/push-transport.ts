import { createECDH, createPrivateKey, sign } from "node:crypto";
import { request } from "node:https";

/** Fixed provider allowlist prevents subscription endpoints becoming an SSRF proxy.
 * No redirects, custom ports, credentials, local hosts or arbitrary push gateways. */
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const allowed =
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.apple.com");
    return (
      allowed &&
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname !== "/"
    );
  } catch {
    return false;
  }
}

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject))
    throw new Error("Invalid VAPID subject");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
  if (ecdh.getPublicKey().toString("base64url") !== publicKey) {
    throw new Error("VAPID key pair does not match");
  }
  return { publicKey, privateKey, subject };
}

/** RFC 8292, ES256 using Node's crypto implementation. Data-less pushes need no
 * RFC 8291 payload encryption: the worker supplies only fixed, public copy. */
export function vapidAuthorization(
  endpoint: string,
  config: NonNullable<ReturnType<typeof pushConfig>>,
  now = Date.now(),
) {
  const publicBytes = Buffer.from(config.publicKey, "base64url");
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: config.privateKey,
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
    },
  });
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 3600,
    sub: config.subject,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `vapid t=${unsigned}.${signature}, k=${config.publicKey}`;
}

export async function sendPush(
  endpoint: string,
): Promise<"sent" | "gone" | "retry"> {
  const config = pushConfig();
  if (!config || !validPushEndpoint(endpoint)) return "retry";
  return new Promise((resolve) => {
    const req = request(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: vapidAuthorization(endpoint, config),
          TTL: "300",
          Urgency: "normal",
          "Content-Length": "0",
        },
      },
      (res) => {
        res.resume();
        const status = res.statusCode ?? 0;
        resolve(
          status === 404 || status === 410
            ? "gone"
            : status >= 200 && status < 300
              ? "sent"
              : "retry",
        );
      },
    );
    // A wall-clock deadline also bounds DNS/TLS stalls. Never log request errors:
    // their messages may contain the secret endpoint.
    const timer = setTimeout(() => req.destroy(), 5000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => resolve("retry"));
    req.end();
  });
}
