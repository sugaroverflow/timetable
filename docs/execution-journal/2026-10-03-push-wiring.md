# 2026-10-03 — Web Push step 2b: subscribe routes, device check and Push switches (#368)

## The ask

Step 2 of `docs/web-push-plan.md` §6 was split in two. PR #378 built the
half that didn't need the push tables (the boot rule, the transport,
`pushPublicKey`). Its FINAL listed what was left once step 1 (#377) landed:
the subscribe and unsubscribe routes with their action limit, a way for
the browser to ask whether this device is on, this user's device list, and
the `push` kinds on the per-forum digest settings mutation. This PR is that
list. It ships inert, and it touches neither the API's boot file nor any
sweep code: step 3 (the sender) was being built at the same time.

## What we built

1. **REST, per user** (`apps/api/src/rest/router.ts`).
   - `POST /api/push-subscriptions` with `PushSubscription.toJSON()` as the
     body (`{ endpoint, keys: { p256dh, auth } }`, plus an optional
     `label`). The checks run in this order:
     1. 503 while `env.push` is null;
     2. 403 for an admin's view-as preview (the `x-view-as` header, or an
        impersonating context) and for a personal API token;
     3. 401 when signed out;
     4. `validPushEndpoint`, the push-service allowlist (400);
     5. the keys must be a 65-byte point on P-256 and a 16-byte secret
        (400), checked by `validPushKeys` in `push-transport.ts`, which is
        a trial encryption of an empty payload, so a stored row is always
        one the sweep can encrypt for;
     6. the `pushSubscribe` action limit (429);
     7. core `subscribePush`: `invalid` → 400, `taken` → 409, `cap` → 409,
        and a new device → 201, a key refresh → 200. The reply carries the
        device's id, label and dates, never its endpoint or keys.
   - `DELETE /api/push-subscriptions` with `{ endpoint }` removes only the
     caller's own row. It has the same first three checks but no
     allowlist (so a device stays removable if a push service ever leaves
     the list) and no action limit (deleting your own row costs nothing).
   - The endpoint is in the body, never the URL, because the request log
     records paths. Nothing in these routes logs; a test spies on the
     console through a subscribe and finds neither endpoint nor keys.
   - REST already ignores tokens and `x-view-as` (`contextFromRequest`).
     The routes refuse both by name anyway, so that stays true if either
     rule ever loosens.
2. **`ACTION_LIMITS.pushSubscribe`** (`apps/api/src/http/action-limits.ts`):
   30 an hour, with the message "You're turning alerts on too often — try
   again in n minutes." Malformed requests are refused before the limiter,
   so they don't use up the budget.
3. **GraphQL** (`apps/api/src/graphql/push.ts`).
   - `myPushDeviceEnabled(endpoint: String!): Boolean!` answers "is THIS
     device on?". The browser passes its own endpoint and gets a yes or no,
     so the server never hands endpoints out.
   - `myPushDevices(endpoint: String): [PushDevice!]` lists this user's
     devices oldest first: `id`, `label`, `createdAt`, `lastSentAt`, and
     `current` (whether it is the endpoint passed in). The type has no
     endpoint field to ask for.
   - Both answer false or null wherever `pushPublicKey` is null: push off,
     signed out, a view-as preview, a personal token.
4. **Push switches** (`apps/api/src/graphql/members.ts`, `types.ts`).
   - `updateMyForumDigestSettings` gains `pushKindsJson`, a JSON
     `{kind: boolean}` object stored as `digestSettings.push`. Like
     `kindsJson` it replaces the stored set; the core merge is shallow, so
     the email `kinds` are untouched. Unlike `kindsJson` it is strict: an
     unknown kind, `drafts` (eventless), a non-boolean or malformed JSON is
     a BAD_REQUEST, because the Push column is new and has no old client
     to tolerate.
   - `Forum.viewerPushKinds` returns the effective switches as JSON, every
     pushable kind resolved through `isPushKindEnabled`, with `drafts` left
     out. The Push column (step 5) can show what will really alert without
     knowing the defaults.

## Verified

- New integration tests in `apps/api/src/app.integration.test.ts` (17):
  503 while off, the view-as and token refusals, 401, the allowlist cases
  (including `evilnotify.windows.com`), six kinds of bad key (including a
  65-byte point off the curve), the core mappings, 201 vs 200, the rate
  limit at the 31st well-formed subscribe, unsubscribe, the device reads
  in every "nothing" case, the stored and resolved Push switches, and the
  rejections.
- The full gate list in CI order passed locally; the PR's FINAL has the
  results.

## Learned

- The `x-view-as` header never reaches REST from the web app
  (`transport.ts`'s `rest()` doesn't forward it), and the view-as cookie
  is path-scoped to `/f/<slug>`, so the API never sees it. So during a
  preview, a REST call from the browser would act as the real admin. For
  push that means the step 4 alerts line must hide itself in a preview,
  which it will, because `pushPublicKey` is null there.

## Left for later steps

- Web: the fragments for `pushPublicKey`, `myPushDeviceEnabled`,
  `myPushDevices` and `viewerPushKinds`, with the alerts line (step 4) and
  the Push column (step 5). No web change was needed here.
- The client should re-send its subscription only when the browser's keys
  or endpoint change, not on every page view, or a member with many open
  tabs could reach the 30-an-hour limit.
