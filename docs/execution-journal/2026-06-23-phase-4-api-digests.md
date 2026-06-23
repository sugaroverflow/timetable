## 2026-06-23T20:08:55Z - Phase 4 API Hardening And Digest Delivery

### Goal

Continue issue #8 after the direct audit fixes landed, focusing on Phase 4 work
that can be implemented and verified locally without introducing a large new
storage or notification architecture.

### Changes

- Added GraphQL operation cost validation alongside the existing depth limit.
- Added `GRAPHQL_MAX_COST` to API env parsing, local env examples, and hosted
  DigitalOcean app specs.
- Added unit coverage for the cost rule, including fragment expansion.
- Reworked API request logging into a shared structured logger with request IDs.
- Changed REST 500 handling to emit structured error logs and return the request
  ID to clients.
- Wired GraphQL Yoga through the same structured logger shape.
- Added a scheduled/manual GitHub Actions digest workflow that calls the existing
  cron-protected digest endpoint.
- Wired `RESEND_API_KEY` and `EMAIL_FROM` through deploy workflows and
  DigitalOcean specs.
- Updated roadmap, deployment, product, and architecture docs to reflect the
  completed hardening/digest slice and the remaining Phase 4 gaps.

### Decisions

Email digest remains the first supported notification channel. Multi-channel
notifications are still explicitly out of scope until there is a product decision
about the next channel.

Binary uploads were left out of this slice because the repo has no S3 client or
multipart upload stack today; adding that is a larger implementation with
dependency, validation, and UI implications.

### Tradeoffs

The cost model is intentionally simple: each non-introspection field selection
adds one unit, including selections reached through fragments. It is not a
schema-aware complexity model and does not apply multipliers for list size.

Structured logs currently go to stdout/stderr for the platform log stream. They
are not yet forwarded to an external error reporting service.

### Risks

- `GRAPHQL_MAX_COST=500` is an initial default and should be tuned against real
  traffic and any future GraphQL integration tests.
- The digest workflow depends on GitHub Environment secrets/variables and a
  verified Resend sender identity being configured outside the repo.
- API rate limiting remains process-local until edge or infrastructure limits are
  introduced.

### Verification

- `git diff --check`
- `ruby -e "require 'yaml'; ARGV.each { |f| YAML.load_file(f) }; puts 'yaml ok'" ...`
- `npm run test --workspaces --if-present`
- `npm run typecheck --workspaces --if-present`
- `npm run lint --workspaces --if-present`
- `npm run build --workspaces --if-present`

### Demo Impact

The API now has a clearer hardening story: depth and cost limits are both in
place, unexpected REST errors are traceable by request ID, and digest delivery
has a concrete scheduled caller instead of a purely manual endpoint.

### Customer-Facing Context

This improves the production-readiness narrative without overstating remaining
work. The app still needs infrastructure rate limits, sender/domain verification,
binary upload handling, feed scalability, and broader integration coverage before
larger real-user usage.

### Next Recommended Step

Use issue #8 to split the remaining Phase 4 work into dedicated PRs: uploads,
feed/dashboard scalability, hosted log drains or error reporting, and integration
test coverage.
