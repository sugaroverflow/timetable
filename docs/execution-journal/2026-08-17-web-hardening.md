# 2026-08-17 — pre-prod security audit: web hardening

Companion to the API hardening entry (same audit). The web audit's
headline was good news — all five `dangerouslySetInnerHTML` sites clean,
the markdown sanitizer sound, transport/OG layers well-built, no secrets
client-side, no open redirects. What it did find:

- **Security headers**: the app served none. `next.config.ts` now sends
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS on every
  route. A real CSP is deferred: the theme `<style>` and pre-hydration
  theme `<script>` are inline, so it needs nonce propagation through the
  proxy first.
- **E2E_TEST_MODE boot guard**: `=1` disables Clerk entirely (proxy,
  provider, sign-in pages) — a one-variable auth kill switch. All five
  check sites now read `e2eTestMode` from `@/env`, which throws at boot
  on a production build. Playwright runs `next dev`, so the suite is
  unaffected; hosted dev (a production build) must never set it.
- **Theme sink re-validation**: `accentVars`/`baseVars` assigned four
  colours into the SSR `<style>` tag trusting the API's write-time
  validator across a service boundary. `safeHex` re-applies `HEX_COLOUR`
  at the sink, so a bad value from any future write path or manual DB
  edit vanishes instead of becoming stored XSS.
- **view-as cookie**: now `samesite=lax; secure` (it granted nothing by
  itself, but hygiene).
- **`rest()` path guard**: refuses absolute/scheme-relative paths so a
  future caller can't send the bearer token cross-origin. Tested.
- **ICS token**: `encodeURIComponent` in the subscribe URL. Moving the
  token out of the query string entirely (POST + header) is a bigger
  redesign, deferred — it still leaks into server logs/history, but the
  token only unlocks a calendar feed.
