## 2026-07-22 - Web Consolidation: Filter Nav, GraphQL Fragments, Role Pickers, Date/Role Helpers

### Goal

Behavior-preserving consolidation of four duplication clusters in the web
app (reuse audit findings): the 10 URL-param filter components, the
copy-pasted GraphQL comment/topic selections, the checkbox role pickers,
and the short-date/primary-role helpers.

### Changes

- `apps/web/src/lib/useSearchParamNav.ts`: `useSetSearchParam()` hook — the
  one copy of the copy-params → set/delete key → `router.push` dance. Opts:
  `resetPage` (delete `page`) and a `mutate` escape hatch (FeedSortControl's
  random-sort seed). Pushes the bare pathname when no params remain. All 10
  filter components (HostFilter, LocationFilter, AudienceFilter,
  ActorFilter, ActivityFilter, ActivityRoleFilter, ActivityDateFilter,
  DashboardActivityFilter, DashboardSinceFilter, FeedSortControl) now use
  it; each keeps its existing quirks — only HostFilter and FeedSortControl
  reset `page`, only AudienceFilter/DashboardActivityFilter map "all" to
  no-param. URL semantics unchanged.
- `apps/web/src/lib/gqlFragments.ts`: `COMMENT_FIELDS`, `commentTree(field)`
  (the 3-level nested selection), and `TOPIC_FEED_FIELDS` (feed/permalink
  topic selection). Adopted in feedPage.ts, the topic permalink page,
  topics/page.tsx, and moderation/page.tsx — resulting queries are
  semantically identical (verified by token comparison; only the feed's
  `contentUpdatedAt` moved to the end of its selection set).
- `apps/web/src/components/RoleCheckboxGroup.tsx`: shared checkbox group
  over `ASSIGNABLE_ROLES` with two pixel-identical variants — "pill" (raw
  role names, InviteForm) and "inline" (forum role labels, AddPersonForm).
  MemberRolesEditor keeps its distinct pill-toggle UI but now uses the
  shared `ASSIGNABLE_ROLES` + `roleLabel()` instead of local copies.
- `apps/web/src/lib/dates.ts`: `formatShortDate(iso, { year? })` (en-GB
  day/month, optional 2-digit year) — adopted in InviteSendButton (no year)
  and BreakdownTable (year).
- `packages/shared/src/roles.ts`: new `primaryRole(roles)` (owner/admin →
  admin, host → host, else elector) — adopted in people/page.tsx and
  activity/page.tsx (the latter via a wrapper that keeps returning null for
  roleless actors). notifications/page.tsx now uses `isAdmin()` instead of
  an inline owner/admin check.

Net: −145 lines. No schema, route, or copy changes.
