## 2026-06-24T16:13:18Z - Optional Dev Seed Deploy

### Goal

Allow hosted dev deploys to refresh sample data without making seeding part of
every automatic deploy or any production deploy.

### Changes

Added a `seed_sample_data` checkbox to the manual `Deploy Dev` workflow. The
workflow passes `SEED_DEV_SAMPLE_DATA` into the DigitalOcean dev app spec.
`.do/app.dev.yaml` now includes a `seed-sample-data` post-deploy job that runs
`npm run db:seed` only when that flag is `true`; otherwise it exits cleanly with
a skip message.

Updated README and deployment docs to explain the manual hosted-dev seed path.

### Decisions

Kept the seed off automatic `main` deploys. The sample seed replaces the
`spt-test-data` timetable, which is useful for demo refreshes but should require
an explicit manual deploy choice.

Kept production untouched. `.do/app.yaml` has no seed job and no seed workflow
input.

### Tradeoffs

DigitalOcean will still create a post-deploy job on every dev deploy, but the
job is a no-op unless the manual workflow input is checked. This keeps the app
spec deterministic while leaving destructive fixture refresh behind an explicit
operator action.

### Risks

The checkbox path depends on GitHub Actions substituting `SEED_DEV_SAMPLE_DATA`
into the App Platform spec through `digitalocean/app_action/deploy`. The dev app
spec validates locally, but the full optional path still needs one manual
workflow run in GitHub to prove end-to-end substitution and job execution.

### Verification

Validated `.do/app.dev.yaml` with `doctl apps spec validate --schema-only`, ran
`npm run typecheck`, and ran `git diff --check`.

### Demo Impact

The team can refresh `dev.timetable.love` sample data from the GitHub Actions UI
without exposing the seed to production or requiring local database access.

### Customer-Facing Context

The seed remains deterministic, explicit, and dev-scoped. It is suitable for
demo fixture refreshes, not production data initialization.

### Next Recommended Step

After merge, manually run `Deploy Dev` with `seed_sample_data` checked and verify
the `spt-test-data` timetable appears on `dev.timetable.love`.
