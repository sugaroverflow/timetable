## 2026-06-24T17:16:10Z - API Smoke Coverage

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
  - digest job protection when `CRON_SECRET` is unset or wrong
  - unreadable ICS calendars returning 404 without loading slots
  - readable ICS calendars returning calendar headers and slot content

### Decisions

This branch covers API guardrails first and does not add Playwright. Browser
smoke testing needs a separate dependency/dev-server pass and is better landed
as its own focused audit slice after the current manual dev testing assignment.

The new endpoint tests use an ephemeral local listener so they exercise the real
Express middleware stack. Database-backed core reads are mocked only for the ICS
cases that would otherwise require fixtures.

### Tradeoffs

The tests do not yet cover authenticated happy paths for invites and membership
role edits. Those need either seeded database fixtures or a dedicated service
test harness for Clerk/session users.

### Risks

- Local sandboxes that block localhost listeners need an elevated test run; CI
  and normal developer machines should be able to bind the ephemeral port.
- Playwright smoke coverage remains open.
- Authenticated invite/member happy-path integration coverage remains open.

### Verification

- `npm run test --workspace @timetable/api`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

### Demo Impact

No direct UI change. The API now has regression coverage around endpoints that
matter for manual dev verification: auth boundaries, digest cron protection, and
calendar feed behavior.

### Customer-Facing Context

This reduces the risk of regressing security-sensitive REST behavior while the
remaining audit work is tested manually in dev.

### Next Recommended Step

Open a PR against `main`, update issue #8, then continue with a separate
browser smoke path or authenticated REST fixture coverage.
