# 2026-10-03 — Web Push step 6: the "Get Notifications" sidebar link (#368)

## The ask

Step 6 of `docs/web-push-plan.md` §6, with §3.4's table as the spec. Ed's
ruling (2026-10-03): "Can 'Get Notifications' be a link in the sidebar
only on devices where it's possible and not installed? And also where
alerts are offered?" The "where alerts are offered" half is #381's alerts
line; this PR is the sidebar half. Step 5 (the Push column in
`DigestSettingsForm`) was being built at the same time, so this PR leaves
`DigestSettingsForm`, the Notifications page and `AlertsLine` alone, and
touches neither `apps/api` nor `packages/*`.

## What we built

1. **`components/GetNotificationsLink.tsx`** (get-notifications-link), in
   the forum sidebar foot between the theme toggle and "Report a bug",
   dressed like those foot links with Lucide's `BellRing`. It reads #381's
   push-device store (`usePushDevice`) and starts detection with
   `refreshPushDevice` from an effect, so it follows §3.4 exactly:
   - **"off"** (push works here, no subscription for this device, the
     installed iPhone app included): a `next/link` to
     `/f/<slug>/notifications#alerts`. The click also closes the mobile
     drawer, because when you are already on the Notifications page the
     path doesn't change and the drawer's close-on-navigation wouldn't
     fire.
   - **"ios-tab"** (iPhone/iPad in a browser tab, desktop-mode iPads
     included): a button opening a Base UI Popover titled "Get
     Notifications" over the shared `InstallSteps`, so the sidebar and the
     alerts line give one explanation.
   - **"on", "unsupported" (no PushManager or service worker, iOS before
     16.4), "denied", and "unknown"**: nothing.
   - **No `pushPublicKey`, no viewer, or a view-as preview**: nothing, and
     no detection runs at all.
2. **The forum layout** asks for `pushPublicKey` and `me { id }` in the
   query it already runs for the badges (members only), and passes them
   with `preview` (the view-as cookie, already read for the exit button)
   to the link. The API already returns a null key under view-as; the
   preview check is a second guard, as on the Notifications page.
3. **CSS** (`globals.css`, tokens only): `.sidebar-foot-button` strips the
   button chrome so the iPhone trigger looks like its neighbours;
   `.get-notifications-positioner` sits at `calc(var(--z-modal) + 2)`,
   above the mobile drawer (`--z-modal + 1`), which the popover opens
   from; `.get-notifications-popup` copies the reaction popup's card look
   and caps its width at `min(320px, 100vw - 32px)`.

No change to `lib/push.ts` or `InstallSteps` was needed.

## Hydration

The store's server snapshot is "unknown", so the server render and the
first client render are both empty; detection replaces it in an effect.
A test renders the component with `renderToString` and gets "". In the
browser runs below, no hydration warning was logged.

## Verified

- `GetNotificationsLink.test.tsx` (jsdom, 13 cases, the pattern of
  `QueueControls.test.tsx`). The store and the pure `detectPushSupport`
  are real; only `refreshPushDevice`, the part that talks to the browser
  and the server, is replaced through `vi.hoisted`, and it publishes
  what real detection finds for each pretend device:
  - the server render is empty;
  - an iPhone 17.4 tab gets the button and the steps in the popover;
  - a desktop browser that can push, and the installed iPhone app, get
    the link to `#alerts`, and clicking it closes the drawer;
  - "on" is hidden, and turning alerts on (the store going to "on")
    removes the link without a reload;
  - no PushManager, no service worker, iOS 16.3 and permission denied are
    hidden;
  - a null key, a view-as preview and no viewer are hidden and never
    start detection.
- Real Chromium (the installed 1234 build), against `next dev` in
  E2E mode on a throwaway harness route that mirrored the forum shell
  (the real topbar hamburger, `Sidebar`, `ThemeToggle` and
  `GetNotificationsLink`, with nav links copied from the layout). The
  route was never committed. With no service worker registered, detection
  ran for real:
  - desktop Chrome: an `<a>` to `/f/newspeak-2026/notifications#alerts`;
  - an Android phone viewport: the same link in the drawer;
  - an iPhone 17.4 user agent: a `<button>`, and the popover opens above
    the drawer; Escape closes the popover and leaves the drawer open;
  - a desktop-mode iPad (Mac user agent with 5 touch points): the button
    and popover in the desktop rail;
  - an iPhone 16.3 user agent, and `Notification.permission` forced to
    "denied": no link.

## Learned

- Playwright's `iPhone 13` descriptor carries `iPhone OS 15_0`, which
  detection rightly calls unsupported (before 16.4), so the link is
  hidden. A screenshot of the iPhone row needs a 16.4+ user agent.
- Chromium's touch emulation reports `maxTouchPoints` 1, so a desktop-mode
  iPad (which needs more than 1) has to be faked with an init script.

## Left for later steps

- Step 7: the CLAUDE.md glossary entry (get-notifications-link, beside
  #381's alerts-line, push-device and install-steps) and ARCHITECTURE.md.
- Step 8: on dev with keys, check that the link appears, opens the
  alerts line and disappears once alerts are on, and on a real iPhone
  that Safari shows the steps.
