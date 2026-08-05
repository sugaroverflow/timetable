# Architecture

Timetable is a TypeScript npm-workspaces monorepo with a Next.js web app, an
Express/GraphQL API, shared domain services, and a PostgreSQL database managed
through Drizzle.

Since the 2026-07 rebrand the product is branded **Topic** (future domain
topic.forum) and the tenant entity is a "forum" in all user-facing copy. Code
identifiers, the `@timetable/*` package names, the `/timetables` resolver,
CSS classes, and the DB schema deliberately keep `timetable` naming — but the
PUBLIC API surface (GraphQL exposed names, `/api/forums/*` REST URLs) says
forum (2026-07-27; see the GraphQL Surface section), and new user-visible
strings must say forum/Topic. This document otherwise uses the code names.
The domain cutover (still timetable.love) happens separately.

## Repository Shape

```txt
apps/
  web/    Next.js App Router UI, Clerk auth, server and client API calls
  api/    Express, GraphQL Yoga, REST jobs/integrations, Clerk token verification
packages/
  db/     Drizzle schema, client, migrations
  core/   Domain and service layer used by API routes
  shared/ Pure roles, permissions, validation, slug, and weighted-heart logic
```

## Stack

| Concern | Choice |
| --- | --- |
| Web | Next.js 16 App Router, React 19 |
| Auth | Clerk on web and API |
| API | Express 5, GraphQL Yoga, Pothos |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-kit migrations |
| Markdown | markdown-it and sanitize-html on the API; TipTap (tiptap-markdown) editor on the web |
| Email | Resend when configured, console fallback in development |
| Hosting | DigitalOcean App Platform and Managed PostgreSQL |
| Tooling | TypeScript, ESLint, Prettier, Vitest, Playwright, Docker |

Formatting is Prettier with default options (YAML and Markdown are exempt —
deploy specs are sed-templated); `npm run format:check` is a CI gate and the
baseline reformat commit is listed in `.git-blame-ignore-revs`. Linting covers
every workspace: `apps/web` uses its own Next.js flat config, and the root
`eslint.config.mjs` lints `apps/api`, `packages/*`, `tests/`, and `scripts/`
(`npm run lint` runs both).

## Runtime Boundaries

```mermaid
flowchart LR
  browser[Browser]
  clerk[Clerk]
  web[apps/web]
  api[apps/api]
  core[packages/core]
  shared[packages/shared]
  dbpkg[packages/db]
  pg[(PostgreSQL)]
  email[Resend or console]
  cron[GitHub Actions scheduler]
  cal[Calendar app]

  browser <-->|session| clerk
  browser --> web
  web -->|GraphQL/REST with bearer token| api
  browser -->|client GraphQL/REST with bearer token| api
  api -->|verify token, load user| clerk
  api --> core
  core --> shared
  core --> dbpkg --> pg
  api --> email
  cron -->|POST /api/jobs/digests| api
  cal -->|GET .ics| api
```

The product runtime has no autonomous agents or AI orchestration. Build-time
Codex/agent workflows are separate from the app runtime.

## Web App

`apps/web` renders:

- minimal public landing page (📚 brand mark + sign-in/sign-up links)
- Clerk sign-in and sign-up routes
- signed-in app shell: topbar with the current timetable's identity and a
  per-user light/dark toggle; left sidebar — a slide-in drawer on mobile —
  with section nav, a "Report a bug" link, and the timetable switcher (with
  visibility pills) in its footer
- topic feed with infinite scroll, sort controls (the four heart
  normalisations, latest comments, newest-including-edits, seeded random),
  host filter with profile card, and "new since last visit" highlights;
  electors also get the **Topic Queue** (`/f/[slug]/queue`, its own
  sidebar page with a red never-seen badge; old `?sort=queue` redirects):
  one unhearted topic at a time in a per-user stable shuffle with big
  🔁/❤️ decision buttons, round-based with an explicit restart
  (`packages/core/src/queue.ts`);
  hosts/admins get a sortable per-elector breakdown table (the shared
  `BreakdownTable` component: L1/L2/devotion weights + hearted-at, footer
  sums matching the topic's scores, names linking to person pages)
- topic permalinks at `/f/[slug]/[hostSlug]/[topicSlug]` (stale host segments
  redirect; old `/t/` URLs permanently redirect and must keep doing so)
- person pages at `/f/[slug]/[userSlug]` (per-forum member profiles; a
  userId segment canonically redirects to the member's slug)
- My Topics (feed-identical cards + manage controls, TipTap editor; admins
  can create a topic on behalf of another host)
- Pending Topics (the submitted moderation queue; the draft topic status was
  removed — new topics are created as `submitted`)
- activity timeline (week/day grouping, date range, actor/role/type filters)
- notifications pane (comments on your topics, replies to you, unread badge)
- People page (role-grouped members, bios, admin editing; admins get an
  add-person card plus per-member invite state and a View as → Send invite →
  Edit profile action stack)
- settings (timetable profile + theme sections, hearts cutoff, invites)
- user profile (name, avatar, markdown bio, digest preferences)
- Calendar (v2, 2026-07-31; feature-flagged per forum via
  `settings.calendar.enabled` — nav link and page exist only when on):
  month-grouped slot rows with a topic lens, per-elector avatar groups
  (host/admin), elector weekly-pattern grid, admin pattern×terms setup with
  client-side slot generation, host off-piste proposals, session
  pencil/confirm controls, claim comments with frozen availability snapshots
- Analysis page (`/f/[slug]/analysis`): topics analysis table with ❤️ and 💬
  normalisations, per-table host filters, elector activity table with
  per-row topic folds, admin-only host activity table
- `/admin` sysadmin dashboard (SYSADMIN_EMAILS-gated forum overview/delete)
- `/timetables` resolver → last-engaged timetable's feed, or the create screen
- social preview (Open Graph) cards for the app, forums, topics, and people
  (`opengraph-image.tsx` per segment + `lib/ogCard.tsx`; resolved via a
  session-less GraphQL fetch so private content degrades to generic cards)

Per-timetable theme (colours, fonts, dark palette) is validated server-side,
stored in the settings JSON, and applied through a server-rendered style tag;
the user's light/dark choice is applied pre-paint from localStorage.

All web data access goes through one deep module,
`apps/web/src/lib/transport.ts`, which owns URL resolution, auth headers, and
GraphQL error handling behind a `TransportAuth` seam with server
(`transport.server.ts`, Clerk session token) and client
(`transport.client.ts`) adapters. Callers use four thin wrappers —
`gqlFetch` (`lib/graphql.ts`) and `apiFetch` (`lib/restClient.ts`) on the
server, `clientGql` (`lib/clientGraphql.ts`) and `clientApi`
(`lib/clientApi.ts`) in the browser — never hand-rolled `fetch`. Reads are
GraphQL; membership/invite/timetable writes plus uploads/cron/ICS are REST,
and that split is intentional.

Feed-page view-model derivation is centralised in `apps/web/src/lib/feedPage.ts`:
`topicPerms` computes a topic card's permission flags from the viewer's roles
and the topic status in one place, and `topicCardProps` assembles the shared
`TopicCard` props for every feed-like page.

## API App

`apps/api` owns request handling and auth boundary:

- GraphQL Yoga at `/graphql`
- REST under `/api`
- health check at `/health`
- Clerk token verification
- local user upsert on first API request
- digest rendering/sending
- ICS generation
- markdown rendering/sanitization
- request logging
- structured REST/Yoga error logging
- store-backed rate limiting, with shared PostgreSQL buckets in hosted apps
- GraphQL depth and cost limiting

REST routes currently include:

| Route | Purpose |
| --- | --- |
| `POST /api/forums` | Create a timetable; creator becomes owner and admin |
| `POST /api/forums/:id/invites` | Invite emails and assign timetable roles |
| `POST /api/forums/:id/people` | Admin add-person: silently create the Clerk user + local row + membership in one call, no email |
| `POST /api/memberships/:id/invite` | Admin send (or resend) the invite email via Resend; records `inviteSentAt` |
| `PATCH /api/memberships/:id/roles` | Change member roles |
| `DELETE /api/memberships/:id` | Remove a member (the owner can never be removed) |
| `POST /api/jobs/digests` | Cron-protected digest job |
| `GET /api/forums/:idOrSlug/calendar.ics` | Calendar feed |
| `GET /api/forums/:idOrSlug/feed.atom` | Atom feed of the newest published topics (anonymous-only — private forums 404) |
| `GET /api/forums/:idOrSlug/export` | Read-only JSON export of a forum's public data |
| `DELETE /api/forums/:id` | Delete a forum (sysadmin dashboard) |
| `POST /api/uploads` | Signed direct browser uploads to S3-compatible storage |
| `GET /health` | Health check |

Legacy `/api/timetables/:idOrSlug/{calendar.ics,feed.atom}` URLs 301-redirect
to the `/api/forums` equivalents (query string preserved — ICS tokens live in
members' calendar apps). Never remove.

The add-person flow deliberately splits account creation from the invite
email: `getOrCreateClerkUser` (`auth/clerk.ts`) finds or silently creates the
Clerk account (Clerk sends nothing), admins populate the profile and topics,
and the invite email is an explicit second step. `inviteSentAt` on
`timetable_memberships` (migration 0017) is null until it is sent.

## GraphQL Surface

The public surface uses **forum** naming (2026-07-27); the web app's own
queries alias the fields back to internal `timetable` names
(`timetable: forum(idOrSlug: $s)`), so TypeScript identifiers stay unchanged.

Main queries include:

- `me`
- `myForums`
- `forum`
- `myMembership`
- `forumMembers`
- `forumPeople` / `person` (People page and person pages, with published
  topics per person)
- `topicFeed` (sort + seed + host + hearted-by-me filters, offset paging)
- `topicPermalink`
- `hostDashboard`
- `moderationQueue` (submitted topics; the draft topic status was removed)
- `activityTimeline` (actor, date-range args)
- `notifications` / `notificationsUnread`
- `myFeedLastSeenAt`
- `forumHosts`
- `calendar` (audience lens + `includePast`; per-elector rows host/admin-only)
- `slotComments`
- `myAvailabilityPattern`
- `dashboard`
- `myIcsToken`
- `timetableRouteByDomain`
- `forumByDomain`

The `dashboard` query accepts optional host and elector-activity filters for
host/admin planning views.

`Member` exposes `inviteSentAt` so the People page can show per-member invite
state.

Main mutations cover:

- topic creation (hosts and admins; `createTopic` takes an admin-only
  `hostId` to create on behalf of another host, logged as `topic.reassign`),
  editing, submission, moderation, unpublishing, and owner reassignment
  (`reassignTopic`)
- heart toggling and the timetable hearts cutoff (`setHeartsCountFrom`);
  host 💙 toggling (`hostHeartTopic`, host-non-electors only — tallies and
  the per-topic host breakdown are admin-only, attribution rides the
  host-only thread)
- public and host-only comments (the host-only thread is a forum option,
  `settings.hostComments.enabled`, default on)
- comment hiding
- profile and notification settings; admin member-bio editing
  (`updateMemberBio`)
- timetable profile and settings, including validated theme JSON
- feed and notification watermarks (`markFeedSeen`, `markNotificationsSeen`)
- slot bulk creation (`createTimeslots`, idempotent pattern×terms
  generation), host off-piste proposals (`proposeSlot`), editing, deletion
- per-slot availability (`setAvailability`) and the weekly template
  (`setMyAvailabilityPattern`); effective state resolves explicit → pattern
  cell (via the slot's `cellKey`) → yellow
- slot comments, optionally as session claims (`topicId` + a
  server-computed, frozen 🟢🟡🔴 snapshot of that topic's hearters), with
  author edit/delete and admin hide (`updateSlotComment`,
  `deleteSlotComment`, `hideSlotComment`)
- the session lifecycle (`setSlotSession`: a topic OR an office-hours
  `sessionHostId`, + `empty`/`proposed`/`confirmed` + URL), gated by the
  forum's confirm policy and the never-displace rule
  (`canTouchSlotSession` against `session_host_id`); calendar actions are
  activity-logged and session events notify the topic's hearters
- topic publishing by the owning host when
  `settings.topics.hostsPublishDirectly` is on (same `moderateTopic`
  mutation; admin review becomes post-hoc)

Hearts, comments, invites, and first sign-ins are logged as activity events
alongside moderation and lifecycle actions.

The web proxy uses `timetableRouteByDomain` to rewrite custom-domain requests
onto the existing `/f/[slug]` route tree.

## Auth Flow

Clerk owns identity and session state. Timetable stores authorization and domain
data in PostgreSQL.

1. Browser authenticates with Clerk.
2. Web server/client sends a Clerk session token to the API.
3. API verifies the token with `@clerk/backend`.
4. API creates a local `user` row on first sign-in using the Clerk user id.
5. Pending email invites are claimed by matching the user's email.
6. Domain services load timetable memberships and enforce role permissions.

There are no Auth.js tables and no Clerk webhook is required for normal
operation. A future `user.deleted` webhook could be added if hard deletion of
local rows is required.

## Data Model

Core tables:

- `user`
- `timetables`
- `timetable_memberships`
- `timetable_invites`
- `topics`
- `hearts`
- `host_hearts` (host 💙s, 2026-08-04: the host-non-elector parallel
  gesture, mirrored from `hearts` in its own table so elector weighting
  never sees it; ignores `heartsCountFrom`)
- `heart_events` (2026-08-05: append-only ❤️/💙 add/remove ledger — never
  updated or deleted by the app, unaffected by the cutoff; lets voting
  history be reconstructed across un-hearts and cutoff resets. Written by
  both toggles, read only by the admin data export)
- `comments`
- `activity_events`
- `timeslots` (calendar v2: + `status`, singular `topic_id`, `url`,
  `created_by_id`, `cell_key` — the pattern-cell provenance for inference —
  and `session_host_id`, THE session-ownership column: the topic's host,
  or the host themselves for topic-less "office hours" sessions; the
  `slot_topics` m2m was dropped, simultaneous sessions are separate slots)
- `availability` (explicit per-slot answers)
- `availability_patterns` (one row per forum+user; jsonb cell → state map)
- `slot_comments` (+ optional claim: `topic_id` and frozen
  green/yellow/red counts; + `edited_at`/`hidden_at`/`hidden_by_user_id`
  for author edits and admin moderation)
- `api_rate_limit_buckets`

Notable columns: `timetables.settings` is a JSON blob holding role labels,
theme (colours, fonts, dark palette), icon/cover URLs, digest defaults, the
calendar group (enabled flag, confirm policy, locations, pattern cells,
terms), the topics policy (`hostsPublishDirectly`), and the host-comments
option (`hostComments.enabled`, default on — hides the host-only thread and
💙 attribution when off);
`timetables.heartsCountFrom` is the heart-count cutoff; `topics.slug` +
`timetable_memberships.slug` power permalinks (member profiles are
per-forum); `topics.contentUpdatedAt` tracks content edits
for "newest" sorting; memberships carry `lastSeenFeedAt` and
`lastSeenNotificationsAt` watermarks plus `inviteSentAt` (null = added by an
admin but never invited). A membership with `inviteSentAt` null AND both
seen-watermarks null is a pre-created account whose owner doesn't know the
forum exists — the digest builder skips those forums entirely
(2026-08-03).

The settings JSON shapes (`TimetableSettings`, `ThemeSettings`, role labels,
notification defaults) live in `packages/shared/src/settings.ts` as the single
source of truth: `packages/db` types its jsonb columns with them and the web
app parses/renders them from the same definitions. Types needed on both sides
of the HTTP boundary follow this pattern.

Migrations live in `packages/db/drizzle`.

## Deploy Topology

Merging to `main` auto-deploys dev (dev.timetable.love) when CI is green: the
workflow builds the web Docker image, pushes it to the DigitalOcean container
registry (`timetable-reg`), and deploys from `.do/app.dev.yaml`. After each
deploy it prunes the registry to the newest 5 `web` tags and starts a garbage
collection (the 500 MiB Starter registry otherwise fills in weeks).
Production deploys are manual-only. Per-PR review apps were removed
(2026-07-22) — dev is where QA happens. Details in `docs/DEPLOYMENT.md`.

## Assets

Static README images live in `docs/assets/readme`.

Web assets live in `apps/web/public/assets`. Next.js serves them from the site
root. Since the rebrand the logo is the 📚 emoji rendered inline (topbar
brand and landing page) and the favicon is an emoji data URI (`lib/favicon.ts`
— forums can override it with their own icon emoji); the old
`timetable.love-logo-transparent.png` asset is unreferenced and slated for
deletion at the domain cutover.

## Architecture Risks

- GraphQL has depth and cost limits, but both should be tuned as public traffic
  grows.
- Hosted API rate limiting uses shared PostgreSQL buckets; a dedicated edge/WAF
  limit may still be needed for high-volume public traffic.
- Production env validation exists for core API variables but is not exhaustive.
- Topic and slot mutations check `deactivated` privacy; future mutations need
  the same review.
- Activity logging covers topic lifecycle, hearts, comments, invites, first
  sign-ins, and settings changes; new user actions should keep logging.
- Weighted feed and dashboard queries may need batching/materialization at
  scale; the 2026-07-22 simplify audit measured on the order of 120 DB queries
  to render the feed page for an admin (lazy breakdown loading, batched
  comments, and per-request memoisation are queued fixes).
- Feed sorting (including seeded random) happens in the service layer after
  loading the timetable's published topics; fine at current sizes, revisit for
  very large timetables.
