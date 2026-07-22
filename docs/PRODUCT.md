# Product

Timetable helps a group turn proposed sessions into a schedule. The app combines
topic proposals, weighted interest signals, availability collection, moderation,
and planning analytics. It is a multi-tenant web app where each timetable is its
own workspace with members, roles, and independent settings.

Since the 2026-07 rebrand the product is branded **Topic** (future domain
topic.forum, 📚 logo) and a timetable is called a **forum** everywhere in the
UI. This document keeps the historical "timetable" term, matching the code
identifiers, routes, and schema, which deliberately keep the old name.

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

A member whose roles have all been removed keeps the timetable in their
switcher but otherwise sees what an anonymous visitor sees at the
timetable's visibility level: no composer, no hearts, no People page, no
member-only panels. Admins can also remove members outright from the
People page (the owner can never be removed).

## Topic Feed

Hosts (and admins) write topics in a rich-text editor — markdown stays the
stored format. There is no separate draft status: a new topic is created as
`submitted` and is immediately publishable by an admin. Admins publish,
unpublish, edit inline, reassign a topic's owner (and can create a topic on
behalf of another host), and hide comments; pre-publish feedback happens in
the topic's drafting thread (admin-only comments the owner can reply to).
Pending Topics shows the submitted queue.

Published topics get stable permalinks (`/t/{timetable}/{host}/{topic}`;
slugs freeze at first publish). The feed is single-column with infinite
scroll and sorts by hearts (any of the four normalisations below), latest
comments, newest (content edits count as new, without triggering email), or
seeded random (the default). Topics published or edited since the member's
last visit are highlighted. Filtering by a host shows their profile card
above their topics.

Electors can heart and comment on published topics; each hearted card shows
the elector their own "your vote: 1/n" weight. Hosts and admins can see
weighted scores and per-elector breakdowns; electors see only the public feed.

Heart weighting comes in four normalisations, shared by the feed sort control
and the Analysis leaderboard:

| Mode | Formula | Meaning |
| --- | --- | --- |
| Total hearts | Σ❤️ | Every heart counts equally (L∞) |
| Enthusiasm (L2) | Σ 1/√n | Discounted by the square root of each elector's total hearts |
| One vote each (L1) | Σ 1/n | Each elector splits one unit of influence across their hearts |
| Average devotion | (Σ 1/n)/Σ❤️ | The mean share of their hearts that this topic's supporters gave it |

where `n` is the number of published topics that elector hearted.

The per-elector breakdown is a sortable table: one row per elector with their
L1, L2, and devotion contributions plus when they hearted, with footer sums
that match the topic's scores; elector names open their profile card. The
same table appears on feed cards (for hosts and admins) and in the dashboard.

Admins can set a timetable-wide hearts cutoff: hearts created before it are
ignored in every count and weight (this replaced per-topic heart archiving).

Topic comments support threaded public threads (auto-collapsed), a separate
host-only thread with its own composer, labelled with the timetable's host
label, and an admin-only drafting thread (visible to admins and the topic's
owner only, never rendered in the feed) where pre-publish feedback lives.
Comments support @mentions, which notify the mentioned member.

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
- member and role management from the People page (roles + markdown bios),
  including adding people and sending their invite emails
- timetable profile: name, description, visibility, custom role labels with a
  live preview sentence, digest defaults, and the custom domain field
  (marked "coming soon" — routing is not wired up yet)
- theme: primary/secondary/background/topbar/text colours with live preview,
  curated font pairings, a dark-mode palette, cover image, and icon
- hearts cutoff
- dashboard analytics, including host-scoped elector activity

Adding a member is a two-step flow so their first sign-in lands in a
ready-made account. An admin adds the person from the People page — this
silently creates their account and membership, with no email sent — then
populates their profile and creates topics on their behalf. When everything
is ready, the admin explicitly sends the invite email (which mentions how
many topics are waiting). Each member card shows its invite state ("Not
invited yet" / "Invited 12 Jul") with a Send/Resend button, alongside
View as and Edit profile actions.

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
member's topics, replies to their comments, and @mentions of them, each
linking to the comment; an unread badge in the sidebar clears when the pane
is opened.

For email, users can opt into digest sections:

- new published topics
- replies to their comments
- activity on their hosted topics (including topics reassigned to them)

Admins can set timetable digest defaults, applied to new members who have
never customized their own preferences.

Email digests are the first supported notification channel. The digest
computation, REST job endpoint, scheduled GitHub Actions caller, and Resend env
plumbing exist; production delivery still requires a verified sender identity in
the Resend dashboard. Invite emails from the add-person flow go through the
same Resend plumbing and are only ever sent when an admin explicitly triggers
them.

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
| Product feedback round 1 (PRs #64/#66/#67) | Done | Design-token theming + Base UI, draft-status removal, the four vote normalisations + Random default sort, @mention notifications, nav/People/Analysis polish |
| Product feedback round 2 (PRs #75/#76/#78/#81/#85) | Done | Sortable per-elector breakdown table, mobile slide-in drawer, "Topic"/forum rebrand (code phase), add-person + deferred invite email flow |

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

- The rebrand shipped its code phase only: the topic.forum domain cutover (DO domains, Clerk domain, Resend domain, DNS) is pending, so the app still lives at timetable.love; API error strings, ICS identifiers, and a proper favicon are decided at cutover.
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
