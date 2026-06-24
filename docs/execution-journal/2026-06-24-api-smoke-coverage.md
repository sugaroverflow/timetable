## 2026-06-24T17:16:10Z - API and Browser Smoke Coverage

### Goal

Continue issue #8 after syncing `main` and advance the remaining integration
test coverage work with a small, repo-contained branch.

### Changes

- Extracted API app construction into `createApiApp()` so tests can import the
  Express/Yoga stack without starting the production listener.
- Kept `apps/api/src/index.ts` focused on runtime startup.
- Added Vitest endpoint smoke coverage for:
  - `/health`
  - unauthenticated timetable creation
  - unauthenticated invite management
  - unauthenticated membership role edits
  - authenticated non-admin invite rejection
  - authenticated admin invite success
  - membership role edits that cannot grant `owner` to non-owners
  - membership role edits that preserve the timetable owner's owner/admin roles
  - digest job protection when `CRON_SECRET` is unset or wrong
  - unreadable ICS calendars returning 404 without loading slots
  - readable ICS calendars returning calendar headers and slot content
- Added root Playwright setup, a `test:e2e` script, ignored Playwright
  artifacts, and CI browser-smoke execution.
- Added anonymous browser smoke coverage for `/`, `/sign-in`, and `/sign-up`.
- Added an explicit `E2E_TEST_MODE=1` path for Playwright that skips Clerk's
  development-browser middleware/provider and renders the existing auth fallback
  shell without needing live Clerk credentials.

### Decisions

The new endpoint tests use an ephemeral local listener so they exercise the real
Express middleware stack. Database-backed core reads are mocked only where
needed for ICS and membership/invite fixture coverage.

The Playwright tests intentionally cover anonymous shell routes first. Clerk's
development-browser handshake requires a live Clerk development instance; the
E2E-only bypass keeps CI deterministic while still catching blank-page
regressions in the public/auth shell.

### Tradeoffs

The browser smoke does not sign in through Clerk or exercise authenticated
create/edit workflows. Those need either Clerk test users, a dedicated auth test
harness, or a product-level test mode with seeded sessions.

### Risks

- Local sandboxes that block localhost listeners need an elevated test run; CI
  and normal developer machines should be able to bind the ephemeral port.
- CI now installs Chromium for Playwright, which adds runtime to the verify job.
- `E2E_TEST_MODE=1` must remain limited to tests; normal dev/prod paths still
  use Clerk middleware and provider.
- Authenticated browser workflow coverage remains open.

### Verification

- `npm run test --workspace @timetable/api`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`

### Demo Impact

No direct UI change. The API and browser shell now have regression coverage
around behavior that matters for manual dev verification: auth boundaries,
digest cron protection, calendar feed behavior, and nonblank public/auth pages.

### Customer-Facing Context

This reduces the risk of regressing security-sensitive REST behavior or shipping
another blank auth shell while the remaining audit work is tested manually in
dev.

### Next Recommended Step

Open/update the PR against `main`, update issue #8, then continue with either
object-storage uploads or feed scalability as the next repo-contained audit
slice. Rich authenticated browser workflows can be added once there is a
controlled Clerk/session test harness.
