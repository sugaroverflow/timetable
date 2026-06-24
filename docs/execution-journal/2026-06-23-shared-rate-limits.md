## 2026-06-23T22:30:00Z - Shared API Rate Limit Buckets

### Goal

Continue issue #8 on a branch separate from PR #15 and close the
infrastructure-aware API rate limiting gap.

### Changes

- Added a store-backed rate-limit middleware with standard limit headers.
- Kept the memory store for local development.
- Added a PostgreSQL-backed store for hosted environments, using one atomic
  upsert per bucket hit so limits are shared across API instances.
- Added the `api_rate_limit_buckets` table and migration.
- Added hosted `RATE_LIMIT_BACKEND=database` and environment-specific bucket
  prefixes to the DigitalOcean app specs.
- Documented the new rate-limit backend configuration.

### Decisions

Production defaults to the database backend and fails fast if `DATABASE_URL` is
missing. Local development defaults to memory so contributors can run the API
without a database-backed limiter during early setup.

### Tradeoffs

This uses PostgreSQL instead of introducing Redis, Upstash, or a dedicated edge
rate-limit service. That keeps the deploy surface small for the current
DigitalOcean App Platform shape, but it adds one small database write per
limited request and should still be paired with edge/WAF limits before
high-volume public launch.

### Risks

- The database-backed limiter adds one small write per limited request.
- Rate-limit tuning still needs real traffic data.
- A dedicated edge/WAF limit may still be useful before high-volume public
  launch.

### Verification

- `npm run test --workspaces --if-present`
- `npm run lint --workspaces --if-present`
- `npm run typecheck --workspaces --if-present`
- `npm run build --workspaces --if-present`
- `git diff --check`

### Demo Impact

This is mostly invisible in the UI, but it strengthens the deployment story:
hosted API limits now remain coherent if the API scales beyond one instance.

### Customer-Facing Context

The app now has a production-shaped abuse-control path instead of relying on
per-process memory. For enterprise review, this is still app-level protection;
network-edge controls remain the stronger outer layer for high-volume abuse.

### Next Recommended Step

Open a PR against `main`, update issue #8, then continue with either hosted log
drains/error reporting or object-storage uploads as the next audit slice.
