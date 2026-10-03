# 2026-10-03 — Web Push step 2: VAPID config, payload encryption and transport (#368)

## The ask

This is step 2 of `docs/web-push-plan.md` §6, "API config, transport,
encryption", built in parallel with step 1 (the push tables, the shared kind
defaults and core `managePush`). This PR covers only the half that doesn't
need step 1, so it doesn't touch `packages/db`, `packages/shared` or
`packages/core`. Ed ruled on the plan's decisions on 2026-10-03. PR #378.

## What we built

1. **The boot rule** (`apps/api/src/push-config.ts`, called once from
   `env.ts` next to the `SPACES_*` block, as #368 finding 6 asks).
   - With none of `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
     set, `env.push` is null and push is off. Empty or whitespace counts as
     unset, so a spec placeholder whose GitHub secret is missing (which
     expands to `""`) can't take the API down. The SPACES rule learned this
     the hard way in PR #72.
   - When all three are set and valid, `env.push` is a frozen
     `{ publicKey, signingKey, subject, paused }`. "Valid" means:
     - the subject is `mailto:<address>` or a parseable `https://` URL;
     - the public key is base64url of a 65-byte uncompressed point;
     - the private key is base64url of 32 bytes and a real P-256 scalar;
     - the public key is the one the private key derives.
   - When the set is partial or invalid, production throws, so DO keeps the
     previous deployment. Elsewhere it warns "… — Web Push is off". The
     message names variables, never values.
   - The private key is kept only as a `KeyObject`. Its inspect and JSON
     forms carry no key material, so logging `env` can't leak it. A test
     pins this.
   - `PUSH_PAUSED`: unset, `""`, `false` or `0` means running; `true` or `1`
     means paused. Any other value also pauses, with a warning, because a
     kill switch someone typed is meant to be on.
2. **The transport** (`apps/api/src/push-transport.ts`).
   - `validPushEndpoint` is #360's allowlist plus Microsoft's
     `*.notify.windows.com` for Edge. It suffix-matches on whole labels, so
     `evilnotify.windows.com` and the bare apex both fail.
   - `encryptPushPayload` implements RFC 8291 `aes128gcm` as one record: an
     ECDH and two HKDFs, then AES-128-GCM with the 0x02 delimiter and no
     padding. Each message gets a fresh ephemeral key and salt. Payloads
     over 3 KB are refused.
   - `vapidAuthorization` is RFC 8292 ES256 (raw r‖s), audience-bound to
     the push service's origin, and its token expires after 1 hour.
   - `sendPush` sets `TTL: 3600` and the `Urgency` the caller passes. It
     has a 5 s wall-clock deadline, follows no redirects, and never throws
     or logs. It returns a `PushSendResult`, and the error text (which can
     carry the endpoint) is dropped. The outcomes are:
     - `ok`;
     - `gone`, for 404 or 410;
     - `rate-limited`, for 429, with Retry-After in seconds;
     - `retryable`, for 5xx, a timeout or a network failure;
     - `rejected`, for a refused endpoint, bad keys, an oversized payload
       or any other status.
   - **node:crypto, no library.** The plan's §2 already says this. A
     library would hold the signing key, add a supply-chain surface for
     about sixty lines, and the RFC's worked example pins the result down
     byte for byte anyway.
3. **GraphQL `pushPublicKey`** (`apps/api/src/graphql/push.ts`). It returns
   the key, or null when push is off, the viewer is signed out, an admin is
   in a view-as preview, or the request uses a personal API token. It still
   returns the key while paused, because the kill switch keeps the
   controls.
4. **`scripts/generate-vapid.mjs`**, ported from #360. It prints the two
   key lines to stdout and the "PRIVATE is a secret" warning to stderr.
5. **Wiring.**
   - `.env.example` has all four variables, empty.
   - Both `.do` app specs list the three VAPID values on the **api**
     component as `type: SECRET` from `${VAPID_*}`.
   - Both deploy workflows pass `secrets.VAPID_*` into the
     `digitalocean/app_action` env, the same way `SPACES_KEY` is passed.
   - `PUSH_PAUSED` comes from a GitHub environment **variable**
     (`vars.PUSH_PAUSED`), not from the console alone. The reason is under
     "Learned" below.

## Verified

- **The RFC 8291 §5 vector.** The encryptor reproduces the published body
  exactly from the published salt and keys. Separately, a browser-side
  decryptor written in the test (not shared with the encryptor) decrypts
  both the RFC's message and fresh round trips.
- **JWT.** The test checks the header, the claims (`aud` is the endpoint's
  origin, `exp` is now + 3600, and `sub`), that the signature verifies
  against the public key and is 64 raw bytes, and that the header contains
  no private key material.
- **The send.** With the network mocked, the test checks the headers and
  that the body decrypts. It also checks each outcome: 200, 404, 410, 429
  with Retry-After, 503, 3xx and 4xx, a network error, the timeout, and
  refusals before any request is made.
- **The templating.** The real `utils.ExpandEnvRetainingBindables` from
  `digitalocean/app_action` (checked out at cc55bc9) was run over both
  specs with the VAPID variables empty and with them absent. Every
  `VAPID_*` and `PUSH_PAUSED` value became `""`, and the bindables
  (`${APP_URL}`, `${timetable-db.DATABASE_URL}`) were kept. The boot-rule
  test then shows that all-empty in production is "off", with no throw and
  no warning.

## Learned

- `app_action` turns any **non-bindable** placeholder into `""` when the
  variable is unset or empty. That covers a secret that is missing, and
  even a workflow that forgot to pass the variable. So "empty counts as
  unset" is the whole of what keeps a key-less deploy safe.
- A deploy rewrites the app spec. An env var added **only in the DO
  console** survives a restart but is dropped by the next deploy, and dev
  deploys on every merge. That is why `PUSH_PAUSED` is templated from a
  GitHub variable. Setting it in the console still works as an immediate
  lever until the next deploy.

## Left for after step 1

- The subscribe and unsubscribe REST routes, with the `pushSubscribe`
  action limit.
- This user's device list.
- The `push` kinds on `updateMyForumDigestSettings`.

The `FINAL:` comment on PR #378 lists exactly what each one needs.
