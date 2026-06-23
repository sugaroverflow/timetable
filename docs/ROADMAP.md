# Roadmap And Known Limitations

This file tracks implementation status and remaining risks. It reflects the
tracked codebase, not local untracked experiments.

## Phase Status

| Phase | Status | Summary |
| --- | --- | --- |
| Phase 0: Foundation | Done | Monorepo, Drizzle migrations, Clerk auth, timetable/membership/invite REST, core GraphQL, timetable switcher, DigitalOcean specs, CI |
| Phase 1: Topic Feed MVP | Done | Topics, hearts, comments, activity log, moderation, weighted hearts, markdown rendering, feed and moderation UI |
| Phase 2: Profiles, privacy, polish | Mostly done | Profiles, privacy enforcement, comment hide, unpublish, archive hearts, host filter, digest prefs |
| Phase 3: Availability calendar | Done | Timeslots, weekly repeat, availability, weekday patterns, audience filters, slot discussion, topic tagging, ICS |
| Phase 4: Notifications, domains, analytics | Partial | Dashboard analytics, conflict alerts, digest computation/job, custom domain field and lookup |

## Ready For First Testing When

- Dependencies are installed.
- PostgreSQL is running locally or managed in DigitalOcean.
- Migrations have been applied.
- Root `.env` and `apps/web/.env.local` are configured.
- Clerk keys and allowed origins/domains are correct.
- Optional digest services are either configured or intentionally disabled.

Suggested smoke test:

1. Sign in.
2. Create a timetable.
3. Add or invite users with admin, host, and elector roles.
4. Create, submit, publish, heart, and comment on a topic.
5. Create slots and mark availability.
6. Tag topics to slots.
7. Open the dashboard.
8. Open or subscribe to the ICS feed.

## P0 Hardening Before Real Users

- Add GraphQL depth or cost limits.
- Add API rate limiting.
- Add fail-fast environment validation.
- Re-check timetable `deactivated` privacy on mutations.
- Add structured logging and error reporting.
- Add integration tests around permission boundaries.

## Product Gaps

- Custom role labels and theme colors are stored but not consistently rendered.
- Feed has no cursor pagination or infinite scroll.
- Feed `comments` sort uses comment count, not latest-comment timestamp.
- Host dashboard filter by elector activity is not implemented.
- Custom-domain hostname routing is not implemented in the web app.
- Multi-channel notifications are not started.
- Calendar sync is one-way ICS only.
- Upload/avatar/cover editing is not committed in tracked code.

## Operational Gaps

- Digest delivery needs a scheduled caller and Resend configuration in hosted
  environments.
- Object storage variables exist in deployment specs, but upload code is not
  committed.
- DigitalOcean provisioning cannot be proven from the repo alone.
- Production and dev Clerk instances must stay separate.

## Testing Gaps

Current committed tests are limited. The most important next tests are:

- role/permission unit tests
- topic lifecycle tests
- heart weighting tests across archived and published topics
- GraphQL integration tests for each role
- REST integration tests for invites, memberships, digest job, and ICS
- Playwright smoke test for the main workflows

## Performance Risks

- `buildFeed` loads all timetable hearts for published topics.
- Dashboard analytics derive weighted data through the feed path.
- Some GraphQL field resolvers perform per-row lookups.
- Digest job is O(users) and should be revisited before large-scale usage.

Potential future fixes:

- dataloaders for GraphQL resolvers
- materialized weighted scores
- cursor pagination
- job queue for digests
- database indexes based on production query plans
