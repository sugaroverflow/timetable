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
| Admin | Moderate topics, create topics and reassign their owner, see every host's drafts, hide comments, manage members and their bios from the People page, edit settings and theme, set the hearts cutoff, create slots, tag topics to slots, view the dashboard |
| Host | Propose topics (rich-text editor), submit drafts, edit their own topics from the feed, see weighted-heart breakdowns, use host-only threads, join slot discussions, view the dashboard |
| Elector | Read published topics, heart and comment on them, collect "My hearted topics", set availability |

Each timetable can rename its roles (e.g. Admin → Dean, Host → Faculty,
Elector → Fellowship Candidate); the custom labels are used throughout the UI.
Every member has a markdown bio, shown in a popup from any byline and on the
People page (members grouped by role; hosts list their published topics).

## Topic Feed

Hosts (and admins) draft topics in a rich-text editor — markdown stays the
stored format — and submit them for moderation. Admins publish, request
changes (threaded feedback the host can reply to), unpublish, edit inline,
reassign a topic's owner, and hide comments. Pending Topics shows the
submitted queue ("Ready to publish") plus a read-only list of every host's
drafts so forgotten drafts stay visible.

Published topics get stable permalinks (`/t/{timetable}/{host}/{topic}`;
slugs freeze at first publish). The feed is single-column with infinite
scroll and sorts by most hearts, latest comments, newest (content edits count
as new, without triggering email), or seeded random. Topics published or
edited since the member's last visit are highlighted. Filtering by a host
shows their profile card above their topics.

Electors can heart and comment on published topics; each hearted card shows
the elector their own "your vote: 1/n" weight. Hosts and admins can see
weighted scores and per-elector breakdowns; electors see only the public feed.

Heart weighting:

```txt
weight = 1 / number of published topics that elector hearted
```

This means each elector distributes a total influence of 1 across all published
topics they heart.

Admins can set a timetable-wide hearts cutoff: hearts created before it are
ignored in every count and weight (this replaced per-topic heart archiving).

Topic comments support threaded public threads (auto-collapsed) and a
separate host-only thread with its own composer, labelled with the
timetable's host label. Admin feedback for requested changes lives in the
host-only thread.

## Availability Calendar

The calendar is currently unlinked from navigation (re-adding it is tracked in
issue #55); the routes, API, and ICS feed remain fully functional.

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

- Pending Topics (submitted queue + all hosts' drafts)
- activity timeline: grouped by week and day with a date-range filter,
  actor avatars/roles, filters by action type, actor, and role, and enriched
  entries (comment text with a link to the comment, invites, first sign-ins)
- member and role management from the People page (roles + markdown bios)
- timetable profile: name, description, visibility, custom role labels with a
  live preview sentence, digest defaults, and the custom domain field
  (marked "coming soon" — routing is not wired up yet)
- theme: primary/secondary/background/topbar/text colours with live preview,
  curated font pairings, a dark-mode palette, cover image, and icon
- hearts cutoff
- dashboard analytics, including host-scoped elector activity

Everyone gets a personal light/dark/auto mode toggle in the topbar; the
timetable's theme defines both palettes.

Navigation is a left sidebar (drawer on mobile) with the timetable switcher —
including a visibility pill per timetable and "New timetable" — in its footer.
The topbar shows the current timetable's icon and name. New users with no
timetable land on the create screen; returning users land on the feed of the
timetable they last engaged with.

Profile images, topic covers, icons, and timetable covers can be pasted as
image URLs or uploaded through the app to S3-compatible object storage.

## Privacy

Timetable visibility is enforced server-side across five levels:

| Mode | Read Access |
| --- | --- |
| `public` | Anyone can read topics, public comments, and member bios; sign-in is still required to heart or post |
| `hosts_only` | Topics and host bios are public; comments and non-host bios are hidden from non-members |
| `no_comments` | Topics and all bios are public; comments are hidden from non-members |
| `private` | Members only |
| `deactivated` | Admins only |

Members always see everything their role allows, regardless of level.

## Notifications And Sync

In-app: each timetable has a Notifications pane listing comments on the
member's topics and replies to their comments, each linking to the comment;
an unread badge in the sidebar clears when the pane is opened.

For email, users can opt into digest sections:

- new published topics
- replies to their comments
- activity on their hosted topics (including topics reassigned to them)

Admins can set timetable digest defaults, applied to new members who have
never customized their own preferences.

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
| QA round 1 (issue #42, PR #56) | Done | Sidebar nav + switcher, permalinks, infinite scroll, People page + bios, admin topic management, hearts cutoff, five-level visibility, My hearted topics, enriched activity log, rich seed data |
| QA round 2 (issue #59, PR #60) | Done | Status-aware moderation actions, role-label copy, Profile nav, sidebar-footer switcher, People grouping + member editing, random sort + edits-as-new, admin drafts, activity grouping/filters, full theming + dark mode + fonts, TipTap editor, My Topics feed parity, notifications pane |

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

- Custom-domain hostname routing is wired in the web proxy; production DNS/Clerk domain setup must still be configured per environment (the settings field is labelled "coming soon").
- Email digest is the only email channel; Slack, push, and others are not started. No immediate email on topic reassignment yet (#57).
- The in-app notifications pane has no per-item read state or mark-all-read.
- The activity feed is refresh-based, not live (#58).
- The availability calendar is unlinked from navigation pending re-add (#55).
- Calendar sync is one-way ICS export only.
- Feed pagination is offset-based behind infinite scroll; cursor pagination is a future scalability item.

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
