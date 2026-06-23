## 2026-06-23T20:49:04Z - Dev Deploy Guardrails

### Goal

Make `dev.timetable.love` deploys noisier when they fail and reduce avoidable
deploy overlap after `main` pushes.

### Changes

- Added a `deploy-dev` concurrency group to the dev deployment workflow.
- Added post-deploy checks for `/health`, `/`, and `/graphql` on
  `https://dev.timetable.love`.
- Required `CRON_SECRET` for hosted API startup alongside the existing
  database, Clerk, and web-origin requirements.
- Documented the dev deploy runbook and rollback expectations in
  `docs/DEPLOYMENT.md`.

### Decisions

The deploy workflow checks the public dev URL after DigitalOcean reports
success, which verifies the routed app rather than only the build/deploy job.
The workflow serializes dev deployments instead of canceling in-progress deploys
so every successful CI run has a deterministic deploy outcome.

### Tradeoffs

The smoke checks are intentionally shallow. They prove the deployed app is
reachable and GraphQL responds, but they do not replace the manual dev testing
plan or future browser automation.

### Risks

Database migrations remain the highest deploy risk because app rollback does
not restore database state. Missing hosted secrets now fail faster, which is
better operationally but can turn a previously partial deployment into a clear
startup failure.

### Verification

Pending verification for this change should include the normal local build,
typecheck, lint, test, migration command, and a live `Deploy Dev` run after the
change reaches `main`.

### Demo Impact

Dev deploy status becomes easier to trust before demos because GitHub records a
public URL smoke check after every successful App Platform deployment.

### Customer-Facing Context

The deployment path now has explicit CI gating, serialized dev deployment, and
public endpoint smoke checks. Rollback expectations are documented, including
the important distinction between app rollback and database recovery.

### Next Recommended Step

Add a small Playwright smoke test once the manual dev testing plan has been run
and the highest-priority dev blockers are known.
