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
| Phase 4: Notifications, domains, analytics | Partial | Dashboard analytics, conflict alerts, digest computation/job, custom domain field/routing, ICS export, and initial API hardening |

## Ready For First Testing When

- Dependencies are installed.
- PostgreSQL is running locally or managed in DigitalOcean.
- Migrations have been applied.
- Root `.env` and `apps/web/.env.local` are configured.
- Clerk keys and allowed origins/domains are correct.
- Optional digest services are either configured or intentionally disabled.
- Local or CI verification passes: `npm run build`, `npm run typecheck`,
  `npm run lint`, `npm run test`, and `npm run test:e2e`.

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

- Tune GraphQL depth/cost limits as the schema and public traffic grow.
- Tune database-backed API rate limits after observing hosted traffic.
- Expand fail-fast environment validation beyond the current production checks.
- Continue auditing timetable `deactivated` privacy on new mutations.
- Route structured request/error logs into hosted error reporting or log drains.
- Keep hosted deploy smoke checks aligned with the user-critical API paths they
  are meant to protect.

## Product Gaps

- Custom role labels and theme colors are rendered in the timetable shell and
  main feed fallbacks, but some lower-level copy remains generic.
- Feed has limit/offset pagination but no cursor pagination or infinite scroll.
- Host dashboard elector activity can be filtered by host and activity state.
- Custom-domain hostname routing is implemented in the web proxy; production
  DNS/Clerk domain setup still has to be configured per environment.
- Email digest is the first notification channel; additional channels such as
  Slack or push are not started.
- Calendar sync is one-way ICS only.
- Profile images and cover images can be edited as URLs or uploaded to
  S3-compatible object storage.

## Operational Gaps

- Digest delivery has a scheduled GitHub Actions caller and reserved Resend
  hosted env vars; production still needs verified sender configuration.
- Hosted object storage still needs bucket/CDN credentials configured before
  upload testing in each environment.
- DigitalOcean provisioning cannot be proven from the repo alone.
- Production and dev Clerk instances must stay separate.

## Testing Gaps

Committed audit guardrails now cover:

- shared weighted-heart behavior
- GraphQL depth and cost validation
- memory and database-backed rate-limit behavior, including timestamp encoding
- API endpoint smoke for health, REST auth boundaries, invites, memberships,
  uploads, digest cron protection, and ICS responses
- anonymous Playwright smoke for `/`, `/sign-in`, and `/sign-up`
- hosted dev and production deploy smoke for `/health`, `/`, and `POST /graphql`

The most important remaining tests are:

- authenticated browser workflows once there is a Clerk test-user or session
  harness
- broader GraphQL role/permission fixtures for permission-sensitive changes
- topic lifecycle tests across draft, submitted, published, unpublished, and
  archived states
- performance regression fixtures for feed/dashboard once pagination,
  materialized scores, or dataloaders are introduced

## Performance Risks

- `buildFeed` loads all timetable hearts for published topics.
- Dashboard analytics derive weighted data through the feed path.
- Some GraphQL field resolvers perform per-row lookups.
- Digest job is O(users) and should be revisited before large-scale usage.
- Hosted API rate limiting uses shared database buckets; local development uses
  process-local memory buckets by default.

Potential future fixes:

- dataloaders for GraphQL resolvers
- materialized weighted scores
- cursor pagination
- job queue for digests
- database indexes based on production query plans
