# 2026-10-03 — Installable app: add Topic to your Home Screen (#367)

## The ask

#367, picked by Ed on 2026-10-03. Make Topic installable ("Add to Home
Screen" / "Install app") as **one app named "Topic"**. It is step 0 of
`docs/web-push-plan.md`, because Apple allows web push only for a Home
Screen app. The idea comes from AndreasThinks's #360 (not merged; Ed,
2026-10-02: "build #360's ideas separately ourselves"). Its manifest shape
is reused here.

## What we built

1. **Manifest.** `apps/web/src/app/manifest.ts` serves
   `/manifest.webmanifest`, which Next statically prerenders and links from
   every page. The content lives in `lib/appManifest.ts`:
   - name and short_name "Topic", `display: standalone`, `id: "/"`,
     `scope: "/"`;
   - `start_url: "/timetables"`: the existing landing resolver, which
     forwards a signed-in member to the forum they last visited and sends
     everyone else to `/sign-in`;
   - `theme_color` #ffffff (`--card`, the light topbar's surface) and
     `background_color` #eceef3 (`--bg`, for the splash). A manifest can't
     read CSS variables, so the hex values are copied, and a unit test
     fails if they drift from `tokens.css`.
2. **Icons.** `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and
   `apple-touch-icon.png` (180px), all in `apps/web/public/`.
   - Each is the app's 📚 on an opaque white square, so it matches the
     favicon, the topbar brand and the OG card. The art fills 68% of the
     square, or 56% on the maskable icon so it stays inside the 80%
     safe-zone circle.
   - #360's icons (a green two-pane window) were not reused, because the
     brand is 📚.
   - There was no source image in the repo, so
     `scripts/generate-app-icons.mjs` draws the PNGs from the Twemoji 📚
     SVG, vendored unmodified in `scripts/assets/twemoji-1f4da.svg`. It
     uses sharp, which ships with Next. Two runs produce byte-identical
     output.
   - Run it by hand and commit the result; nothing runs at build time.
   - Twemoji graphics are **CC-BY 4.0** (© Twitter, Inc and other
     contributors). The attribution is in the vendored file and here.
3. **iOS Home Screen tags**, in the root layout's `metadata`:
   - `icons.apple`;
   - `appleWebApp` (title "Topic", status bar "default");
   - `apple-mobile-web-app-capable`, added by hand via `other`, because
     Next 16 emits only `mobile-web-app-capable` and iOS before 16.4 reads
     the apple- spelling.

   Metadata merges shallowly, so a forum with its own icon used to replace
   the whole `icons` object. That would have dropped the apple icon on
   exactly the pages people install from. The forum layout now carries
   `apple` along with its `icon`. The PNG also sits at the conventional
   root path iOS probes.
4. **Viewport and safe areas.**
   - `viewport-fit=cover`, plus a `theme-color` per colour scheme (light
     #ffffff, dark #1d222c = dark `--card`).
   - Zoom is untouched: no maximum-scale or user-scalable.
   - These now pad by `env(safe-area-inset-*)`:
     - the topbar: top, left and right;
     - `.container`: side gutters, and the foot, to clear the home
       indicator;
     - the mobile drawer: top, bottom and left;
     - the toast stack (bottom);
     - the Lounge "+" (right);
     - the Lounge full-screen composer (all sides).
   - Every inset is 0 off notched devices, so desktop and Android are
     unchanged.
   - The status bar is `default` (opaque, dark text) rather than
     `black-translucent`. Translucent would draw white status-bar text over
     the white topbar.
5. **Proxy and CSP.**
   - The proxy matcher now skips `.webmanifest`, as it already skipped
     `.png`. The manifest and icons get no canonical-host or vanity
     redirect, no Clerk handshake and no CSP, and need no session.
   - The CSP gains an explicit `manifest-src 'self'`. `default-src 'self'`
     already allowed the manifest; naming it means a future tightening of
     `default-src` can't silently break installs.
6. **No service worker.** That is step 4 of the push plan.

## What a member sees

- **iPhone/iPad (Safari):** Share → Add to Home Screen offers "Topic" with
  the 📚 icon. Opening it gives a full-screen app with no Safari toolbar,
  and a white status bar over the white topbar.
- **Android (Chrome):** "Install app" (or Add to Home screen) installs
  "Topic". The launcher crops the maskable icon to its own shape. Launching
  shows a splash in `--bg` with the icon, then the app in its own window.
- **Desktop Chrome/Edge:** an install button appears in the address bar.
- In every case the app opens at `/timetables`, so a member lands in their
  last forum, or on Sign in.

## Signing in inside the installed app

- **On iOS, the Home Screen app has its own cookie jar,** separate from
  Safari's. Someone signed in in Safari opens the new icon signed out and
  signs in once inside the app. This is expected (Apple's design, not a
  bug), and the push plan's install steps already say "open Topic from the
  icon, sign in".
- **Email code stays inside the app.** Clerk's prebuilt `<SignIn>` does the
  email-code flow with `fetch` calls to Clerk's Frontend API. Nothing
  navigates the top-level window off our origin, so it stays in the
  standalone window.
- **OAuth is unverified.** Social providers are switched on in the Clerk
  Dashboard, not in code, so this repo can't say whether any are enabled.
  An OAuth sign-in navigates to the provider and back. That leaves the
  manifest's scope, which on iOS opens an in-app browser sheet, and reports
  of the hand-off falling through to plain Safari (which would then hold
  the session instead of the app) recur across iOS versions. If OAuth is
  enabled, test it on a device.
- **Clerk's handshake** (a top-level redirect through the Frontend API host
  when a session token needs refreshing) is also an out-of-scope
  navigation:
  - in production it goes through `clerk.topic.forum`;
  - on dev it goes through a `*.clerk.accounts.dev` host;
  - in the installed app it may flash the in-app browser sheet before
    returning;
  - check this on a device too.

## Tests

- `apps/web/src/lib/appManifest.test.ts`:
  - the manifest's name, display, start_url, scope and id;
  - its colours equal the `tokens.css` values they copy;
  - the icon list is 192 any, 512 any and 512 maskable;
  - every icon (and the apple-touch-icon) is a committed PNG whose IHDR
    size matches its declared `sizes`.
- `apps/web/src/lib/csp.test.ts`: the policy carries `manifest-src 'self'`.
- `tests/e2e/anonymous-smoke.spec.ts` ("carries the install manifest and
  Home Screen tags"), in headless Chromium:
  - the page head has `<link rel="manifest" href="/manifest.webmanifest">`,
    the apple-touch-icon link, `apple-mobile-web-app-title` "Topic", both
    capable metas, the status-bar style, and `viewport-fit=cover` with no
    zoom limits;
  - the manifest answers 200 with no CSP header (the proxy skipped it) and
    parses with the expected fields;
  - all four icons answer 200 as `image/png`.
- **Production build, by hand:** `next start` served
  `/manifest.webmanifest` as 200 `application/manifest+json` with no CSP.
- **Safe areas, by hand:** a harness page loading the built CSS, at 390 ×
  844 and 844 × 390, with Chromium's safe-area inset override. Measured:
  - the topbar's padding-top grows by the top inset;
  - the gutters reach 47px beside a landscape notch;
  - the drawer clears the status bar and the home indicator.

  Chromium's `display-mode: standalone` media emulation didn't take, but
  nothing in the CSS depends on it.

## Worth knowing

- **One app for every forum.** The name, icon and start URL are Topic's
  own; a forum's favicon still changes the browser tab, never the
  installed app.
- Changing a token colour that the manifest copies means changing
  `lib/appManifest.ts` too. The unit test catches `--card` and `--bg`.
- To change the icon, edit `scripts/generate-app-icons.mjs`, run it, and
  commit the PNGs. Installed copies refresh their icon only when the
  browser next re-reads the manifest. iOS never refreshes it: the icon is
  fixed at install time.
