# Web Push and forum guide: upstream reconciliation and CI fixes

Preserved `feat/source-link-web-push` and both feature commits while reconciling
upstream `sugaroverflow/timetable:main` at
`cd9c3de4adbd2e4169f52ec1d03bdb7f943fad83`. The fork's `origin/main` still points
to `8fd891c3497a705c66e949354f597bae58346ad2`; upstream has four newer commits.

## Changes

- Resolve overlapping integration tests, styles, and schema exports while
  keeping the forum guide and upstream contact-details/Lounge behavior.
- Regenerate the unmerged Web Push migration as `0045_web_push`, after
  upstream's 0043 and 0044. Existing upstream migrations/snapshots are preserved;
  the new migration only creates the push table, foreign key, and unique index.
- Move the notification page's view-as/device-settings guard into a small
  server component to satisfy the existing complexity limit.
- Remove the redundant `web.push.apple.com` equality check: it is already
  covered by the unchanged `.push.apple.com` suffix check. Endpoint restrictions
  and redirect behavior are unchanged.
- Type the transport mock methods' `this` as `EventEmitter`.
- Widen the API's no-emit TypeScript root to the repository, accommodating the
  new test that imports core source directly. API typecheck passed on the cached
  base before these feature tests; the workspace errors were introduced by that
  direct import, not by broken core/db production types.
- Extend the private-activity regression cases to cover Lounge replies/mentions.

## Verification in the restricted local environment

- Full lint and format check pass; the existing `CollapsibleTopicBody` hook
  warning remains. `git diff --check` passes.
- Shared tests: 108 passed. Web tests: 95 passed. API tests excluding
  `app.integration.test.ts`: 126 passed, including all Web Push tests.
- Core, DB, shared, and API typechecks pass. Full typecheck and build are blocked
  by absent upstream dependency `frimousse@0.4.0`; the same four web type errors
  reproduce against upstream source. Registry access fails with `ENOTFOUND`.
- The full test command was attempted and interrupted when the HTTP integration
  suite could not run. A targeted integration test confirms `listen EPERM` on
  `127.0.0.1`. Playwright similarly fails its loopback web-server gate with
  `connect EPERM`. No integration/e2e success is claimed.
- `npm run db:migrate`, explicitly directed at local throwaway credentials,
  fails before database access because tsx's IPC listener returns `EPERM`.
  Migration generation and snapshot-chain inspection pass; applying migrations
  remains for CI with its throwaway PostgreSQL service.
- Local Node is 26.7.0, whereas CI uses Node 20. Upstream's latest GitHub
  `verify` job passed: https://github.com/sugaroverflow/timetable/actions/runs/36748139034/job/109999502897.

No deployment, infrastructure, workflow, or secret changes were made. Web Push
still requires the documented optional VAPID configuration and scheduler setup.


## Final reconciliation check (2026-09-30)

The reconciliation checkout still had an in-progress merge, not a merge commit.
The GitHub connector confirmed live upstream main remains at `cd9c3de` and the
fork feature branch at `b423592`; no open upstream PR uses either this feature
branch or `reconcile/source-link-web-push`.

- Removed the obsolete, unjournaled `0043_web_push.sql`; only `0045_web_push`
  now creates the push table. Verified a one-to-one SQL/journal mapping, strictly
  increasing final migration timestamp, and the 0044 → 0045 snapshot ID chain.
  The new snapshot preserves every upstream table and adds only
  `public.push_subscriptions`.
- Restored upstream migrations 0043/0044, their snapshots, and vendored emoji
  JSON byte-for-byte (only trailing newlines differed). All Lounge/contact-details
  application code and dependency manifests match upstream except for the
  explicitly reviewed guide/push integration points. Original staged/unstaged
  patches were saved under `/tmp/timetable-{staged,unstaged}-before.patch`.
- Reused a separate copy of the available dependencies, with workspace links
  resolving to this reconciliation checkout. Vitest is 4.1.9; Node is 26.7.0.
  A clean lockfile install and Node 20 CI remain required.
- Re-ran `npm run format`, `npm run format:check`, and `npm run lint`: pass
  (one existing CollapsibleTopicBody hook warning). Shared: 108 tests; web: 95
  tests including guide rendering/copy and push settings; API excluding HTTP
  integration: 126 tests, including all four push suites. All passed.
- Re-ran full typecheck: core/db/shared/API pass; web reports only the missing
  upstream `frimousse` module and its three consequent implicit-any errors.
  Build with `NEXT_TELEMETRY_DISABLED=1` also fails on that missing module.
  Registry access for `frimousse@0.4.0` fails with `ENOTFOUND`.
- The three targeted push HTTP integration cases fail with `listen EPERM` on
  `127.0.0.1`. E2E cannot start its web server. Migration execution, directed
  explicitly to a throwaway local database URL, fails on tsx IPC `listen EPERM`.
  No database migration, end-to-end success, or live push delivery is claimed.

Publishing remains dependent on working shell GitHub networking/authentication.
`git ls-remote` fails with “Could not resolve host: github.com”; `gh pr list`
cannot connect to api.github.com. `gh auth status` reports its configured account
as invalid, but this cannot be distinguished from the network failure here.
The prepared draft PR title/body is at `/tmp/timetable-web-push-pr.md`.


The supplied worktree's Git metadata is mounted read-only (`index.lock`: EROFS),
so the merge was recreated with the same two parents in the writable checkout
`/tmp/timetable-reconciled-ready`, on `reconcile/source-link-web-push`.
All reviewed tracked files were copied there; the supplied index was preserved.
The standalone bundle is `/tmp/timetable-reconciled-ready.bundle`.

## Host verification superseding the sandbox blockers

The earlier restrictions above apply to the Codex sandbox, not the host.
A clean `npm ci` on the host succeeded. Independently reran:

- Full workspace typecheck: pass, including web.
- Full lint: pass with the existing CollapsibleTopicBody hook warning.
- Format check: pass.
- Canonical `npm test`: shared 108, API 237 (including HTTP integration),
  web 95 tests, all passed.
- Full production build: pass; existing CSS `::highlight(topic-search)`
  parser warning remains.
- GitHub authentication and upstream lookup: pass. Pushed the reconciled branch.

Rendered the actual async GuidePage component with mocked auth/forum data,
using the production-built CSS, into standalone browser fixtures. Chromium
screenshots cover Fellow, Faculty, and 390px mobile layouts; mobile has no
horizontal overflow. This verifies the component preview, not a live authenticated
full-stack session or its navigation. Preview scripts are outside the committed
application tree. Live push-provider delivery, installed-device validation,
actual database migration execution, and end-to-end browser tests remain unverified.
