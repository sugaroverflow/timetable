# Product

Timetable helps a group turn proposed sessions into a schedule. The app combines
topic proposals, weighted interest signals, availability collection, moderation,
and planning analytics. It is a multi-tenant web app where each timetable is its
own workspace with members, roles, and independent settings.

## Core Model

A timetable is an independent workspace. One user can belong to many timetables
and can hold different roles in each one.

Roles are scoped to timetable membership:

| Role | Can |
| --- | --- |
| Owner | Everything an admin can do, plus protected ownership of the timetable |
| Admin | Moderate topics, hide comments, manage members and roles, edit settings, create slots, tag topics to slots, view the dashboard |
| Host | Propose topics, submit drafts, see weighted-heart breakdowns, use host-only threads, join slot discussions, view the dashboard |
| Elector | Read published topics, heart and comment on them, set availability |

## Topic Feed

Hosts draft markdown topics and submit them for moderation. Admins publish,
reject, request changes, unpublish, archive hearts, and hide comments.

Electors can heart and comment on published topics. Hosts and admins can see
weighted scores and per-elector breakdowns; electors see only the public feed.

Heart weighting:

```txt
weight = 1 / number of published topics that elector hearted
```

This means each elector distributes a total influence of 1 across all published
topics they heart.

Topic comments support public threads and host-only visibility. Admin feedback
for requested changes is implemented through host-only comments.

## Availability Calendar

Admins create one-off or weekly repeating timeslots. Electors mark each slot as:

- `green`: available
- `yellow`: maybe
- `red`: cannot attend

Unset availability defaults to `yellow` when aggregating audience counts.
Electors can also apply a weekday pattern across all matching slots.

Hosts and admins can filter availability audiences:

- all electors
- electors who hearted my topics
- electors who hearted a specific topic

Slots support host/admin discussion and can be tagged with topics. A slot tagged
with multiple topics appears as a conflict in dashboard analytics.

## Admin And Settings

Admin surfaces include:

- moderation queue
- activity timeline
- member and role management
- timetable profile and privacy
- custom domain field
- custom role labels, theme colors, and cover image URL
- dashboard analytics, including host-scoped elector activity

Custom role labels and theme colors are rendered in the timetable shell and main
feed fallbacks. Some lower-level UI copy still uses generic role names.

Profile images, topic covers, and timetable covers can be pasted as image URLs
or uploaded through the app to S3-compatible object storage.

## Privacy

Timetable visibility is enforced server-side:

| Mode | Read Access |
| --- | --- |
| `public` | Anyone can read the feed and public comments; sign-in is still required to heart or post |
| `private` | Members only |
| `deactivated` | Admins only |

## Notifications And Sync

Users can opt into digest sections:

- new published topics
- replies to their comments
- activity on their hosted topics

Email digests are the first supported notification channel. The digest
computation, REST job endpoint, scheduled GitHub Actions caller, and Resend env
plumbing exist; production delivery still requires a verified sender identity in
the Resend dashboard.

Calendar sync is one-way ICS export through:

```txt
GET /api/timetables/:idOrSlug/calendar.ics
```

Private timetables require a per-user ICS token.

Custom domains are stored on timetables and resolved by the web proxy so a
configured hostname can route to the matching timetable. DNS and Clerk domain
configuration remain environment setup tasks.

## Implementation Status

| Phase | Status | Summary |
| --- | --- | --- |
| Phase 0: Foundation | Done | Monorepo, Drizzle migrations, Clerk auth, timetable/membership/invite REST, core GraphQL, timetable switcher, DigitalOcean specs, CI |
| Phase 1: Topic Feed MVP | Done | Topics, hearts, comments, activity log, moderation, weighted hearts, markdown rendering, feed and moderation UI |
| Phase 2: Profiles, privacy, polish | Mostly done | Profiles, privacy enforcement, comment hide, unpublish, archive hearts, host filter, digest prefs |
| Phase 3: Availability calendar | Done | Timeslots, weekly repeat, availability, weekday patterns, audience filters, slot discussion, topic tagging, ICS |
| Phase 4: Notifications, domains, analytics | Partial | Dashboard analytics, conflict alerts, digest computation/job, custom domain field/routing, ICS export, initial API hardening, and S3-compatible object storage uploads |

## Go-Live Checklist

Before opening to real users:

- [ ] Tune GraphQL depth/cost limits as the schema and public traffic grow
- [ ] Tune database-backed API rate limits after observing hosted traffic
- [ ] Expand fail-fast environment validation beyond the current production checks
- [ ] Continue auditing timetable `deactivated` privacy on new mutations
- [ ] Route structured request/error logs into hosted error reporting or log drains
- [ ] Add integration tests around permission boundaries
- [ ] Configure verified Resend sender identity so digest emails deliver in production
- [ ] Configure object storage bucket/CDN credentials (`SPACES_*`) in each hosted environment
- [ ] Confirm DigitalOcean provisioning against a live environment
- [ ] Keep production and dev Clerk instances separate

## Known Gaps

**Product gaps**

- Feed has limit/offset pagination only; no cursor pagination or infinite scroll.
- Custom-domain hostname routing is wired in the web proxy; production DNS/Clerk domain setup must still be configured per environment.
- Email digest is the only notification channel; Slack, push, and others are not started.
- Calendar sync is one-way ICS export only.

**Testing gaps**

Committed tests cover: weighted-heart behavior, GraphQL depth/cost validation, rate-limit behavior, API endpoint smoke (health, REST auth boundaries, invites, memberships, uploads, digest cron, ICS), anonymous Playwright smoke for `/`, `/sign-in`, `/sign-up`, and hosted deploy smoke for `/health`, `/`, and `POST /graphql`.

Priority next tests:

- authenticated browser workflows (needs a Clerk test-user harness)
- topic lifecycle across draft → submitted → published → unpublished → archived
- broader GraphQL role/permission fixtures
- performance regression fixtures for feed/dashboard once pagination or dataloaders land

**Performance risks**

- `buildFeed` loads all timetable hearts for published topics on every call.
- Dashboard analytics derive weighted data through the feed path.
- Some GraphQL field resolvers perform per-row lookups.
- Digest job is O(users) and should be revisited before large-scale usage.
- Hosted rate limiting uses shared database buckets; local dev uses process-local memory.

Potential future fixes: dataloaders for GraphQL resolvers, materialized weighted
scores, cursor pagination, job queue for digests, and database indexes based on
production query plans.
