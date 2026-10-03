import { createECDH } from "node:crypto";

/**
 * Test-only: a throwaway VAPID pair generated at runtime (never a committed
 * key), with the private key left-padded to the canonical 32 bytes —
 * `ECDH#getPrivateKey()` drops leading zero bytes for about one key in 256,
 * which once made the suite fail at random (#378 CI).
 */
export function vapidTestPair(): {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
} {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
    VAPID_PRIVATE_KEY: padTo32(ecdh.getPrivateKey()).toString("base64url"),
  };
}

/** Left-pad a P-256 scalar to 32 bytes. */
export function padTo32(scalar: Buffer): Buffer {
  const out = Buffer.alloc(32);
  scalar.copy(out, 32 - scalar.length);
  return out;
}
