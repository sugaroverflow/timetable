## 2026-06-24T20:53:21Z - Dev Rate-Limit Outage

### Goal

Capture the diagnosis and recovery for the dev environment failure reported by
manual testers on `dev.timetable.love`.

### Changes

- Investigated reports that dev was broken on mobile/private browsers.
- Confirmed `/health`, `/`, and `/sign-in` returned `200`, but GraphQL-backed
  timetable pages were failing.
- Reproduced `POST /graphql` returning a rate-limit failure before GraphQL
  execution.
- Identified the root cause in the database-backed API rate limiter: timestamp
  values embedded inside Drizzle SQL fragments were passed to `postgres-js` as
  raw JavaScript `Date` objects.
- Opened and merged PR #22, `fix: encode database rate-limit timestamps`, which
  serializes those SQL-fragment timestamps as ISO strings and casts them as
  `timestamptz`.

### Decisions

The fix kept the database-backed rate limiter enabled for hosted environments
instead of falling back to process-local memory buckets. Only the SQL-fragment
parameters were changed; normal inserted/updated timestamp fields still use
`Date` values through Drizzle's structured insert API.

### Tradeoffs

No temporary dev-only `RATE_LIMIT_BACKEND=memory` workaround was applied because
the underlying bug was small, reproducible, and had a narrow code fix. The
hotfix was merged through the normal PR and CI path before relying on the dev
deployment.

### Risks

- `/health` can stay green while GraphQL-backed user journeys are broken,
  because health does not exercise the rate limiter, GraphQL, or database query
  paths.
- Rate-limit failures were flattened to `Rate limit unavailable`, while the
  nested driver error was not visible in the structured API log output.
- Private browsing on mobile was initially suspected because the tester was in
  private mode, but the verified outage was server-side and affected GraphQL
  requests regardless of browser mode.

### Verification

- Reproduced the live failure with `POST https://dev.timetable.love/graphql`
  returning a `503` origin response surfaced by App Platform as a `503/504`.
- Confirmed the dev database had the `api_rate_limit_buckets` table and applied
  migrations, ruling out a missing migration.
- Ran the patched rate-limit store against the live dev Postgres database and
  confirmed the upsert succeeded.
- PR #22 CI passed build, typecheck, lint, tests, browser smoke, and migration
  checks.
- Deploy Dev succeeded after PR #22 merged.
- Verified live dev after deploy:
  - `/health` returned `200`.
  - `/graphql` returned `200`.
  - `/` returned `200`.
  - `/t/spt-test-data/feed` redirected anonymous users to `/sign-in` instead of
    returning `500`.
  - Recent API logs showed GraphQL `200` responses and no rate-limit errors.
- Ran a mobile Playwright render against live dev for `/`, `/sign-in`, and the
  protected feed redirect. The only console warnings were Clerk development-key
  warnings.

### Demo Impact

Dev is usable again for manual testing. Testers in private browsers should still
see the landing page and sign-in screen; private mode may affect completing auth
or persisting sessions, but it was not the cause of the dev outage.

### Customer-Facing Context

This incident exposed an operational blind spot: infrastructure health checks
covered process liveness but not the GraphQL path users depend on. The system
correctly kept rate limits centralized in the database, but the deployed
implementation needed a driver-compatible timestamp encoding for SQL fragments.

### Next Recommended Step

Add a hosted smoke check that exercises `POST /graphql` after dev deploys, and
consider improving rate-limit error logging so nested driver causes are visible
without requiring a local reproduction.
