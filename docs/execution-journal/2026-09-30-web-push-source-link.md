# Source link and opt-in Web Push

Branch: `feat/source-link-web-push`, based on fork main
`8fd891c3497a705c66e949354f597bae58346ad2`, verified with the GitHub connector.
The supplied checkout's `.git` is read-only; work/commit live in an isolated
checkout at `/tmp/timetable-web-push`. Shell GitHub and npm DNS fail. GitHub connector reads work, but repository
writes require unavailable approval; publishing is blocked. No PR or production
deployment was requested.

- Added a quiet source-repository link beside Report a bug in the forum sidebar.
- Added manifest, install icons, non-caching worker and fixed same-origin click
  destination. Worker alerts are data-less and contain generic text only.
- Added per-forum/device opt-in, gesture-triggered permission, unsupported/iOS/
  denied handling, persistence rollback, and forum-specific opt-out.
- Added session-only subscription writes, authenticated GraphQL reads, endpoint
  ownership checks, provider allowlist and device cap. Preview mode hides controls.
- Added additive migration 0043 with matching Drizzle snapshot/journal.
- Added cron-protected, best-effort delivery using existing notifications; active
  membership, forum readability, topic publication and calendar settings gate it.
- Added VAPID generation helper and setup/limitations in `docs/WEB_PUSH.md`.
  No keys were generated and no secrets/deployment infrastructure were changed.

## Verification

No project dependencies were installed: npm registry DNS is unavailable. A local
Node 26.7.0 tool installation was reused through ignored symlinks for focused tests
(Vitest 4.1.10, TypeScript 6.0.3, Prettier 3.9.5). This differs from the lockfile,
so a clean `npm ci` and complete CI run remain necessary.

Commands and final results:

- `npm run test --workspace @timetable/api -- src/push-transport.test.ts src/push-worker.test.ts src/push-send.test.ts`
  — PASS, 21 tests: endpoint restrictions, JWT signatures, provider responses and
  fixed worker notification/click behavior.
- `npm run test --workspace @timetable/web -- src/components/PushSettings.test.tsx src/lib/push.test.ts`
  — PASS, 6 tests: permission gesture, denial, unsupported/iPad guidance, failed
  persistence rollback and forum-only opt-out. An initial iPad fixture failed
  because jsdom lacked maxTouchPoints; the fixture was corrected and rerun.
- `npm run test --workspace @timetable/shared -- src/push.test.ts`
  — PASS, 4 tests: public events only, time windows, calendar-disabled filtering.
- `tsc --noEmit --strict --skipLibCheck --types node --target ES2022 --module NodeNext apps/api/src/push-transport.ts packages/shared/src/push.ts apps/web/src/lib/push.ts`
  — PASS for these standalone modules only (not the application typecheck).
- `node --check apps/web/public/sw.js`, `node --check scripts/generate-vapid.mjs`
  and `git diff --check` — PASS.
- `npm run test --workspace @timetable/api -- src/push-core.test.ts`
  — BLOCKED at import by missing drizzle-orm; added membership, endpoint ownership,
  unpublished-topic, revoked-access and delivery retry/expiry tests did not run.
- `npm run test` — NOT PASSING: shared 96 passed; API 39 passed with 10 suites
  failing to load; web 66 passed with one suite failing to load. Missing packages
  include drizzle-orm, GraphQL and Next. The new REST integration tests are among
  suites that could not load; they are not claimed as passed.
- `npm run typecheck` — FAILED: unresolved project dependencies and consequent
  typing errors, including Next, Clerk and Drizzle. No full typecheck claim.
- `npm run lint` — BLOCKED: eslint-config-next unavailable (local ESLint 10.8.0).
- `npm run build` — BLOCKED: next executable unavailable.
- `npm run db:migrate` — BLOCKED: tsx IPC pipe creation denied (EPERM); no migration
  applied, and no database-backed test was performed.
- `npm run test:e2e` — BLOCKED: web server cannot start without Next.
- `npm run format` — ran successfully. Unrelated baseline formatting changes from
  the newer local formatter were reverted. `npm run format:check` then flagged
  eight unchanged baseline files; changed code passes a targeted Prettier check.

The original `git fetch origin main` attempt failed on read-only `.git/FETCH_HEAD`;
fetching from the isolated checkout failed with DNS resolution for github.com.
GitHub connector reads subsequently verified the main SHA. Its first Git Data API
write (`create_blob`) was rejected: “MCP tool call requires approval, but approval
policy is never”. No remote branch or commit was created. A local Git bundle is
provided so the committed branch can be recovered in a writable environment.
`npm install web-push --workspace @timetable/api --ignore-scripts --fetch-retries=0 --fetch-timeout=10000`
also failed with ENOTFOUND, without changing package manifests or lockfiles.
The implementation uses Node's standard crypto for RFC 8292 and empty push bodies,
so no new runtime dependencies or lockfile changes are required.

## Remaining operator work

Apply the migration in development, configure VAPID/contact and CRON_SECRET, add
an external non-overlapping `/api/jobs/push` schedule, run clean dependency/CI
checks, and test actual Android/iOS installed-app delivery. There was no live
push-service test here. Delivery is bounded polling/coalescing, not an outbox;
private threads and guaranteed event delivery are outside this initial slice.
