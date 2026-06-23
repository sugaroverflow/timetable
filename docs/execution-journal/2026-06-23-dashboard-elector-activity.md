## 2026-06-23T21:13:08Z - Dashboard Elector Activity Filters

### Goal

Continue issue #8 on a fresh branch while manual dev testing is assigned to the
product owner. Close the repo-contained dashboard gap from the original
specification: hosts/admins need individual elector activity and host-scoped
filtering.

### Changes

- Added host-scoped dashboard analytics in `packages/core`.
- Let internal dashboard feed aggregation read the full weighted feed while
  keeping the public GraphQL feed capped by default.
- Added per-elector activity rows with hearts, comments, availability count, and
  latest activity timestamp.
- Added activity filters for all, active, quiet, no hearts, no comments, and no
  availability.
- Exposed `hostId`, `electorActivity`, and `electorActivity` result rows through
  GraphQL.
- Added dashboard UI controls for host and elector-activity filtering.
- Added a responsive data table for elector activity.
- Stopped unpaginated `buildFeed` callers from being capped at 50 topics, so
  dashboard and calendar analytics can see the full published-topic set while
  paginated feed calls still keep their explicit limit.
- Updated roadmap, product, and architecture docs.

### Decisions

Heart and comment counts are scoped to the selected host's published topics.
Availability count remains timetable-wide because availability belongs to slots,
not a host's topic ownership.

The dashboard continues to use the existing weighted feed path for leaderboard
data; deeper feed/dashboard query optimization remains separate Phase 4 work.
Unpaginated callers now receive the full sorted feed because dashboard analytics
need correctness over arbitrary page-size limits.

### Tradeoffs

This branch does not introduce new database indexes or materialized analytics.
It keeps the implementation small and consistent with the current in-memory
dashboard aggregation approach.

### Risks

- Large timetables may still need query batching, cursoring, or materialized
  scores before heavy real-user usage.
- The activity table has not been visually checked in a browser in this pass,
  only through build/type/lint/test verification.

### Verification

- `npm run test --workspaces --if-present`
- `npm run lint --workspaces --if-present`
- `npm run typecheck --workspaces --if-present`
- `npm run build --workspaces --if-present`
- `git diff --check`

### Demo Impact

Hosts/admins can now filter the dashboard to see which electors have hearted,
commented, or filled availability, including quiet electors who may need follow
up before scheduling decisions.

### Customer-Facing Context

The dashboard now better supports planning review: hosts can scope interest
signals to a host and admins can identify participation gaps without exporting
raw database data.

### Next Recommended Step

Let the product owner test the dashboard in dev after this branch lands. Keep
issue #8 open for uploads, infrastructure rate limiting, hosted log drains,
feed/dashboard scalability, DNS/Clerk verification, and integration/Playwright
coverage.
