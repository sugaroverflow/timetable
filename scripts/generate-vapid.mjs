// Generate one VAPID key pair for Web Push (docs/web-push-plan.md §4).
// Ported from #360. Usage, from the repo root on your own machine:
//
//   node scripts/generate-vapid.mjs
//
// One pair per environment (dev and production), generated ONCE: rotating a
// key silently breaks every existing subscription, and everyone has to turn
// alerts on again. The two key lines go to stdout; the warnings go to
// stderr, so nothing but the keys lands if stdout is piped somewhere.
import { createECDH } from "node:crypto";

const pair = createECDH("prime256v1");
pair.generateKeys();

console.log(`VAPID_PUBLIC_KEY=${pair.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${pair.getPrivateKey().toString("base64url")}`);
console.error(
  [
    "",
    "VAPID_PRIVATE_KEY is a SECRET. Paste it straight into the GitHub",
    "environment secret (timetable-dev or production) and keep the production",
    "one in your password manager. Never save it to a file, ticket or chat,",
    "and never commit it.",
    "Also set VAPID_SUBJECT (a mailto: address the push services may use).",
  ].join("\n"),
);
