# 2026-10-03 — Web Push step 4: service worker and the alerts line (#368)

## The ask

Step 4 of `docs/web-push-plan.md` §6: the browser half of alerts. That
means the service worker that shows an alert and opens it, the client code
that turns alerts on and off for this device, and the alerts line above
"What to include" on a forum's Notifications page. The plan's §1 ("In
their words", "What an alert looks like", "What is on screen") and §3.4
are the spec. It ships inert: while `pushPublicKey` is null (no VAPID
keys, or an admin's view-as preview) nothing renders and no worker
registers. Step 3 (the sweep sender) was being built at the same time in
`apps/api` and `packages/*`, so this PR touches neither.

## What we built

1. **`apps/web/public/sw.js`**, plain JavaScript with no build step.
   - On `push` it parses `{ title, body, url, tag }` (the shared
     `PushPayload`) and calls `showNotification(title, { body, tag,
     renotify, icon, data: { url } })`.
   - Anything missing or malformed, or any `url` that isn't a same-origin
     path, gets the fixed "Topic" / "You have new activity" alert, which
     opens `/notifications`.
   - On `notificationclick` it focuses an open Topic window and navigates
     it, or opens a new one. Only same-origin paths are opened, checked
     again at click time.
   - `install` calls `skipWaiting` and `activate` calls `clients.claim()`,
     so a tap can navigate tabs that were open before the worker arrived.
   - There is no fetch handler and no cache.
   - It is served with `Cache-Control: no-cache` (`next.config.ts`). The
     scope is `/` because the file sits at the root.
   - The proxy matcher already skips `.js`, and the page CSP already had
     `worker-src 'self' blob:`. `csp.test.ts` now pins the `'self'`.
2. **`apps/web/src/lib/push.ts`** (push-device).
   - **Pure detection** (`detectPushSupport` over a `PushEnvironment`
     snapshot) returns one of four answers:
     - `unsupported`: no service worker, `PushManager` or `Notification`,
       not a secure context, or iOS before 16.4;
     - `ios-tab`: an iPhone or iPad in a browser tab, including iPads that
       report as Macs (detected by their touch screen);
     - `denied`;
     - `ready`.

     The "installed" check is `navigator.standalone`, or
     `display-mode: standalone`.
   - **Turn on.** `turnOnPush` asks permission first, as the first await
     inside the click. Then it registers `/sw.js` (only now, so no worker
     exists until someone asks), subscribes with `pushPublicKey`, and
     `POST`s `/api/push-subscriptions` through `clientApi` with a short
     device label ("Chrome on Android").
     - If the server refuses with `taken` (another account holds this
       browser's endpoint), it drops the subscription and subscribes
       again for a fresh endpoint (#377 call 4).
     - Any other failure removes a subscription the server never heard
       of.
   - **Turn off.** `turnOffPush` sends `DELETE` with the endpoint, then
     drops the browser's subscription. Other devices are untouched.
   - **Re-send only on change** (#379 call 10). After a successful send,
     localStorage keeps a SHA-256 of endpoint and keys, per user. A page
     view re-posts only when that hash exists and the browser's
     subscription no longer matches it (rotated endpoint or keys).
     Otherwise it just asks `myPushDeviceEnabled(endpoint)`.
   - **A module-level store** (`usePushDevice`, `useSyncExternalStore`
     with an `"unknown"` server snapshot) is shared by every control.
     Step 6's sidebar link will read it and hide itself when alerts come
     on, with no reload.
3. **The alerts line** (`AlertsLine.tsx`). It renders inside
   `DigestSettingsForm` through a new `alerts` slot, directly above "What
   to include". It stays visible when the email cadence is Never, because
   it is about this device, not email.
   - The `#alerts` anchor is always rendered (empty until detection), so
     step 6's `next/link` jump has a target.
   - Detection runs in a `useEffect`, so there is no hydration mismatch.
   - The page renders it only when `pushPublicKey` is non-null and no
     view-as cookie is set. The API already returns null under view-as;
     the cookie check is a second guard.
4. **`InstallSteps.tsx`**: the iPhone/iPad Add to Home Screen steps. It is
   one component, so step 6's sidebar link gives the same explanation.
5. **`/notifications`**: the minimal forum chooser the worker's fallback
   opens. It lists the viewer's forums, each linking to its Notifications
   page, with no one-forum shortcut (plan §2). A signed-out visitor goes to
   sign-in, then comes back.

## Verified

- Unit and component tests:
  - `push.test.ts`: detection across iPhone, Chrome on iOS, desktop-mode
    iPad, Mac, Android, Windows, and iOS 16.3/16.4; device labels; key
    decoding; fingerprints; the re-send rule; the store.
  - `serviceWorker.test.ts`: `sw.js` runs in a `node:vm` with a fake
    `self`. It checks that the file parses, the handler set, no fetch and
    no cache, the payload, seven fallback cases, focus/navigate/open,
    unsafe tap targets, and URL-check parity with the shared
    `isSafePushUrl`.
  - `AlertsLine.test.tsx` (jsdom) covers every state and both gestures:
    - the states: unsupported, iPhone tab, default, denied and on;
    - turning on, with refusal, `taken` and denial;
    - turning off;
    - the rotated-subscription re-send;
    - two controls sharing the store.
- Headless Chromium (the installed 1234 build, through the 1228 symlink
  shim):
  - `/sw.js` returns 200, `Cache-Control: no-cache`, from both `next
    start` and the e2e dev server.
  - The page CSP carries `worker-src 'self' blob:`.
  - `navigator.serviceWorker.register("/sw.js", { scope: "/" })` succeeds
    from a rendered page, with scope `/` and `updateViaCache: "none"`, and
    the page ends up controlled.
  - Push delivery used CDP `ServiceWorker.deliverPushMessage`:
    - a real payload showed "Joshua Becker in Faculty Lounge" / "but we
      have infinitely nesting…" with tag `lounge:1`;
    - a non-JSON payload and an off-site URL each showed the "Topic" /
      "You have new activity" fallback, on `/notifications`.
  - This works only in full Chromium (`channel: "chromium"`). The headless
    shell displays nothing.
  - Real subscribe was not tried: it needs keys and a push service.
- Screenshots of each state were taken from a harness page. The jsdom
  render of `DigestSettingsForm` with the line in it was placed in a page
  with `tokens.css` and `globals.css`, at phone width (light) and desktop
  width (dark).

## Learned

- `pkill -f <pattern>` from the agent's shell matches the shell's own
  command line and kills it (exit 144). Kill by PID.
- Chromium's headless shell accepts `deliverPushMessage` but never shows
  the notification. Use the full build to see `getNotifications()`.

## Left for later steps

- Step 5: the Push column in `DigestSettingsForm`. The alerts line already
  sits where that list will start, and the card is still titled "Email
  digests" until then.
- Step 6: the "Get Notifications" sidebar link. It reuses `usePushDevice`,
  `refreshPushDevice` and `InstallSteps`, and jumps to `#alerts` with
  `next/link`.
- Step 7: `docs/WEB_PUSH.md`, and the glossary entries for alerts-line,
  push-device, install-steps and notifications-chooser.
