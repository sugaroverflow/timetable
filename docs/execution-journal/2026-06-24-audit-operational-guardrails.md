## 2026-06-24T21:04:57Z - Audit Operational Guardrails

### Goal

Convert the remaining repo-contained audit follow-ups into a PR: make deploy
smoke checks exercise GraphQL, improve hosted error diagnostics, and make the
object-storage CORS setup reproducible.

### Changes

- Added production post-deploy smoke checks for `/health`, `/`, and
  `POST /graphql`, matching the dev deploy guardrail.
- Updated structured request error logging to include nested `cause` chains and
  common driver fields such as `code`, `detail`, `hint`, `severity`, and
  `routine`.
- Added regression coverage proving nested driver details appear in rate-limit
  style request logs.
- Documented the current test contract in the README and roadmap.
- Added deployment docs for manual hosted curl checks across `/`, `/sign-in`,
  `/sign-up`, `/health`, repeated `POST /graphql`, and anonymous
  `POST /api/uploads` route-shape validation.
- Added a `scripts/configure-spaces-cors.sh` helper for applying DigitalOcean
  Spaces CORS with `s3cmd`.
- Updated App Platform specs and env docs to use one shared Spaces bucket with
  environment-specific key prefixes.

### Decisions

The deploy smoke remains shallow and unauthenticated: it verifies process
liveness, homepage reachability, and GraphQL/rate-limit/database-path
availability without needing a Clerk session. Authenticated browser flows are
deferred until there is a controlled Clerk test-user or session harness.

The CORS helper uses `s3cmd` because DigitalOcean Spaces returned
`NotImplemented` for the AWS CLI bucket CORS operation during rollout.

### Tradeoffs

The PR does not automate real image upload smoke tests in GitHub Actions because
that would require browser-accessible storage credentials and a stable hosted
test account. It also does not address feed/dashboard scalability, which remains
a larger product/data-path change.

### Risks

- Hosted uploads still need manual verification after App Platform `SPACES_KEY`
  and `SPACES_SECRET` values are confirmed.
- Production deploy smoke only runs when the manual production workflow runs.
- Nested error logging improves diagnostics but is not a hosted log drain or
  external error reporting service.

### Verification

- `npm run test --workspace @timetable/api -- src/http/request-log.test.ts`
  passed.
- `npm run typecheck --workspace @timetable/api` passed.
- `bash -n scripts/configure-spaces-cors.sh` passed.
- `git diff --check` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test` passed with elevated local bind permission for API endpoint
  fixtures.
- `npm run build` passed.
- `npm run test:e2e` passed with elevated local bind permission for the Next.js
  Playwright web server.
- Deployment smoke behavior is validated by workflow review until the workflows
  execute in GitHub Actions.
- Manual live curl checks showed dev and production serving homepage, auth
  routes, `/health`, GraphQL CORS preflight, and repeated `POST /graphql`.
  Production returned `404` for anonymous `POST /api/uploads`, confirming it was
  still on the pre-upload deployment; dev returned the expected `401`.

### Demo Impact

The dev and production deploy paths now catch the class of outage where
`/health` is green but GraphQL-backed pages fail. Upload setup is easier to
repeat and explain during demo preparation.

### Customer-Facing Context

The audit posture is stronger because operational checks now cover an actual API
path users depend on, not only service liveness. Error logs are also more useful
for incident review without requiring local reproduction.

### Next Recommended Step

Run the PR through CI, merge it, then smoke test hosted dev uploads after
confirming the Spaces credentials and CORS configuration are active.
