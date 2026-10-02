import { createECDH } from "node:crypto";

// Run privately; the second line is a secret. Never commit the output.
const pair = createECDH("prime256v1");
pair.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${pair.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${pair.getPrivateKey().toString("base64url")}`);
