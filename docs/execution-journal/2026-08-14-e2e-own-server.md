# E2E suite always starts its own server, on its own port

**Date:** 2026-08-14
**Trigger:** External PR #272 by Matt (mstem) fixing two e2e config faults;
adopted with one addition so the default run coexists with the dev stack.

## Changes

- **From #272 (Matt's commit, kept verbatim):** `playwright.config.ts`
  threads `--port ${port}` into the webServer command (the workspace dev
  script pins `next dev -p 3000`, so `PLAYWRIGHT_PORT` previously moved only
  the baseURL and the suite waited 120s on a dead port), and sets
  `reuseExistingServer: false` unconditionally — reuse trusted whatever
  answered on the port to be this app, so any stranger on 3000 silently
  hijacked the run as baffling "element not visible" failures.
- **Our addition:** with reuse disabled, a default port of 3000 meant
  `npm run test:e2e` failed "port is already used" for anyone running the
  documented dev stack. The default port is now **3100** (unset or malformed
  `PLAYWRIGHT_PORT` both fall back to it). Nothing ties the tests to 3000:
  `E2E_TEST_MODE` strips Clerk, and the API URL is pinned separately.
- README testing section + CLAUDE.md note the suite starts its own server
  on 3100, `PLAYWRIGHT_PORT` to override.

## Notes

- CI is unaffected throughout: it never set `PLAYWRIGHT_PORT`, and `CI=true`
  already disabled reuse before #272.
