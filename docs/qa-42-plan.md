# QA Feedback Implementation Plan (issue #42, QA meeting notes)

Source: https://github.com/sugaroverflow/timetable/issues/42#issuecomment-4897440571

This plan groups the ~40 QA items into workstreams ordered roughly by
dependency and risk. File references are to the current codebase (post-PR #52).
Open questions are collected at the end — several items can't be finalized
until they're answered.

## Answers to questions embedded in the QA notes

**"How was view as built and is it only in the seed data workflow?"**
It is not tied to seed data. "View as" is a per-timetable, path-scoped cookie
(`preview-as-elector`, `apps/web/src/lib/previewRoles.ts`, UI in
`PreviewToggle.tsx`) that reduces the *displayed* roles of a host/admin to
`["elector"]` for rendering only — all queries and mutations still run with
real roles. It works on any timetable. Separately, the dev workflow lets you
actually sign in as seeded users via Clerk OTP `424242`, which is real
impersonation but dev-only.

## Items already true today (verify, no work needed)

- **Single-column layout**: the feed is already a single vertical stack
  (`feed/page.tsx`, `.stack` in `globals.css`). If QA saw multi-column
  somewhere, it may be the dashboard stat grid — needs confirming.
- **Hearts have timestamps**: `hearts.createdAt` exists
  (`packages/db/src/schema/topics.ts:41`), and archive already works via
  `archivedAt` — archived hearts are excluded from counts and re-hearts count
  fresh. What's missing is *surfacing* timestamps (dashboard) and possibly an
  explicit cutoff control (see Q2).
- **Threaded comments**: `comments.parentId` threading exists end to end.

---

## Workstream 1 — Quick wins: naming, chrome, small UI

1. **Cover image 50% less height**: `.timetable-cover` height 150px → 75px
   (`apps/web/src/app/(app)/globals.css:113-125`).
2. **Rename "Moderation" → "Pending Topics"**: nav label
   (`t/[slug]/layout.tsx:170`), page heading (`moderation/page.tsx:41`),
   overview card link.
3. **"My {host} topics" → "My Topics"**: drop the dynamic role label from the
   nav item (`layout.tsx:159-161`).
4. **Remove the Overview tab**: remove nav item; decide whether `/t/[slug]`
   redirects to `/feed` (Q15). Relocate anything load-bearing from the
   overview page (moderation queue link is now in nav anyway).
5. **Respect naming conventions ("dean" not "admin")**: role display labels
   already exist per timetable (`timetables.settings.roleLabels`; seed uses
   Dean/Faculty/Fellowship Candidate). Audit every hardcoded role string and
   route it through `roleLabel()`: the `Admin:` prefix in
   `AdminTopicActions.tsx:45`, the `(admin)` byline in `activity/page.tsx:86`,
   any others surfaced by a grep for "admin"/"host"/"elector" literals in JSX.
   Where a person performed the action, prefer their name.
6. **Remove "Page 1" from the sort bar**: `feed/page.tsx:106-108`. Whether the
   Previous/Next pager is replaced by infinite scroll is Q1.
7. **Hide Availability, keep functionality**: remove the nav item
   (`layout.tsx:163-165`) but keep the `/calendar` route, API, and ICS feed
   working. Open a GitHub issue to re-add it later (part of this workstream's
   PR checklist).
8. **Single column everywhere** (decided, Q15): every page — including the
   dashboard stat tiles, settings forms, and My Topics — stacks vertically
   as a single column, even on wide desktop. Audit and flatten all grid/row
   layouts in `globals.css` and page markup.

## Workstream 2 — Sidebar navigation + timetable switching + onboarding

Rework of `apps/web/src/app/(app)/t/[slug]/layout.tsx` and the app shell.

1. **Sidebar nav**: move the tab bar into a left sidebar; collapse to a
   hamburger/drawer on mobile (CSS breakpoint + a small client component for
   the toggle). `NavLink` stays; only the container and styles change.
   The sidebar holds section nav only (plus per-timetable chrome: role
   pills, privacy pill, View-as toggle).
2. **Airtable-style timetable dropdown in the global top bar**
   (`header.topbar`, `apps/web/src/app/(app)/layout.tsx:21`) — NOT in the
   sidebar. Replaces the current `<select>` `TimetableSwitcher` from the
   `t/[slug]` layout. Trigger shows the current timetable's icon + name;
   items = user's timetables (with custom icons); last item =
   "＋ New timetable" which opens the create form (move `CreateTimetableForm`
   into a modal or a dedicated `/timetables/new` route). Then remove the
   `/timetables` listing page (dropdown is sufficient, per Q9).
   Requires fetching `myTimetables` in the app layout (currently fetched in
   the `t/[slug]` layout) — bonus: the switcher becomes available on
   non-timetable pages (profile, etc.). Signed-out visitors keep the plain
   brand link.
   Decisions (confirmed):
   - **Brand logo** links to the last-visited timetable's feed (same
     `lastVisitedTimetableId` pointer as the onboarding redirect); falls back
     to the new-timetable screen for users with no timetables.
   - **Home button**: the dropdown trigger doubles as home — the current
     timetable's icon/name leads to `/t/[slug]` → feed; no separate home
     icon in the sidebar.
   - **Switching timetables always lands on the feed** (`/t/{slug}` →
     redirect to `/feed`), never section-preserving.
3. **Custom icon per timetable**: new `settings.iconUrl` field in
   `TimetableSettings` (`packages/db/src/schema/timetables.ts:19`), upload via
   the existing `POST /api/uploads` signed-URL flow, editable in Settings,
   shown in the topbar dropdown and as a "home" button linking to
   `/t/[slug]` → feed (per Q13/Q14).
4. **Onboarding redirects**:
   - Signed-in user with **zero timetables** → redirect to the new-timetable
     screen instead of the empty `/timetables` state.
   - User with **one or more memberships/invites** → redirect to the feed of
     the timetable they last engaged with, falling back to the one they were
     most recently added to / the invite that brought them here. Requires a
     "last engaged" signal — proposal: a `lastVisitedAt` (or
     `lastEngagedTimetableId` on `users`) updated on timetable page view
     (cheap, no new table). See Q8.

## Workstream 3 — Topic card restructure

All in `apps/web/src/components/TopicCard.tsx` + children.

1. **Reorder card elements** to: title → author details → cover image →
   description → hearts + comments count → comment bar → collapsed "vote
   breakdown" dropdown → collapsed "host-only comments" dropdown → host
   actions bar → admin actions bar. (Current order: title/author, body,
   cover, insights panel, comments, composer, actions.)
2. **Split host-only comments out of the vote-breakdown panel**
   (`HostInsightsPanel.tsx:96-111`): two independent disclosure components.
   Give the host-only thread **its own composer** (a `CommentComposer` fixed
   to `host_only` visibility) and **remove the "hosts only" checkbox** from
   the public composer (`CommentComposer.tsx:57-70`). Host-only thread should
   support threading like public comments (it already does at the data layer —
   replies inherit visibility).
3. **Owner edit from the feed**: if `topic.hostId === viewer` (or admin), show
   an Edit affordance on the card reusing the shared `TopicEditForm`. Backend
   already authorizes owner-or-admin on `updateTopic`.
4. **Host actions bar / admin actions bar**: admin bar exists
   (`AdminTopicActions`); host bar is new — contents TBD (Q7b: edit +
   unpublish?).
5. **Auto-collapse comment threads**: render top-level comments with replies
   collapsed behind "View N replies" (and optionally cap initial top-level
   comments with "View all N comments"). Client-side disclosure in
   `CommentList.tsx`; important for the new 100-comment seed topics.
6. **Author details + host profile**: author row shows avatar + linked host
   name; clicking opens the host's markdown profile (dropdown/popover per QA,
   or the bio modal from Workstream 4 — Q11).
7. **Highlight new topics since last login**: visual accent on topics
   published since the viewer's previous session. Approach depends on Q3
   (server-side `lastSeenAt` per membership vs. client localStorage).

## Workstream 4 — Profiles & bios

1. **Markdown bios**: `users.bio` exists. Render through the existing
   `renderMarkdown` pipeline (`apps/api/src/markdown.ts`) — expose `bioHtml`
   on the GraphQL `User`/`Member` types. Profile form gets a hint that
   markdown is supported.
2. **Bio modal on user click**: clicking any user (avatar/name in cards,
   comments, dashboard) opens a popup modal with name, image, rendered bio.
   New `UserBioModal` client component; make `Avatar`/name a button.
3. **Admin edits all bios**: extend the Members section in Settings
   (`MemberRolesEditor.tsx`) with a bio textarea per member; new mutation
   (e.g. `updateMemberProfile`) authorized admin-only, logged to activity.
4. **People page** (decided name): new `/t/[slug]/people` route listing all
   members and their fields (name, roles via labels, bio). Host rows link to
   `/feed?host=<id>` (host filter already exists — `HostFilter`), with a
   breadcrumb back. Nav item "People" visible to admins, hosts, and electors;
   anonymous visitors on public timetables see it gated by Workstream 8's
   visibility rules (e.g. `hosts_only` → host bios only).

## Workstream 5 — Admin topic management

1. **Admin can create topics**: either relax `canProposeTopics`
   (`packages/shared/src/permissions.ts:59`) to `isHost || isAdmin`, or add an
   admin create path that requires picking an owner (Q7). Surfaces on the
   moderation page ("New topic" button) and/or My Topics.
2. **Assign/reassign topic owner**: new mutation `reassignTopic(topicId,
   hostId)` — admin-only, validates target holds the host role
   (`timetableHosts` query already exists for the dropdown), updates
   `topics.hostId`, logs `topic.reassign` activity. UI: a hosts dropdown on
   the moderation card and/or admin actions bar. Once reassigned, the topic
   automatically appears in the new host's My Topics (that page queries by
   `hostId` — no extra work). **Notification (decided)**: a "you have a
   topic" line in the new owner's next daily digest (new digest section);
   open a follow-up issue for immediate email notification.
3. **Threaded admin feedback on drafts**: "request changes" already stores
   feedback as a `host_only` comment (`packages/core/src/topics.ts:141`) but
   the host only sees the latest one as a static `feedback` string
   (`getLatestHostOnlyComment`). Change: on the My Topics draft card, render
   the full host-only comment *thread* for that topic with a reply composer,
   so host and admin can go back and forth. Data layer already supports it.

## Workstream 6 — Linking everywhere

Prerequisite (decided): topic permalink pages at
**`/t/{timetable-slug}/{host-slug}/{topic-slug}`** — topics belong to hosts,
so the host appears in the path. Implementation notes:

- **Topic slugs**: new `topics.slug` column, generated from the title,
  unique per timetable, frozen at first publish (title edits don't change
  it; collisions get a `-2` suffix). Seed fixture names map directly.
- **Host slugs**: users have no slug today — add `users.slug` (from name,
  globally unique, collision-suffixed) and backfill.
- **Resolution & reassignment**: resolve by (timetable, topic slug) only;
  the host segment is canonical-but-cosmetic. If the host segment doesn't
  match the current owner (e.g. after reassignment), 301-redirect to the
  canonical path — old links keep working when topics change hands.
- **Reserved names**: host slugs must not collide with existing top-level
  routes under `/t/[slug]/` (`feed`, `dashboard`, `moderation`, `activity`,
  `settings`, `calendar`, `topics`, `people`, …) — maintain a reserved-word
  list in the slug generator. Next.js static segments win over the
  `[hostSlug]` dynamic segment, so a collision would 404 the host, not
  break the app.

1. **Dashboard**: link every topic (top topics, unallocated) to its permalink;
   show all hosts and all topics (expand the leaderboards into complete
   lists, or add "show all"). Add heart timestamps (latest heart / hearts
   over time) to the tiles/tables.
2. **Pending Topics (moderation)**: show author with the same avatar + name +
   title header as the feed card, render the full description/cover inline
   (no clicking Edit to see fields), link the title to the permalink.
   `ModerationCard` should reuse the feed card's header component.
3. **Activity feed**:
   - Link the topic named in each event (payload already carries
     `{topicId, title}`).
   - **Filter by user**: extend `listActivity` (`packages/core/src/activity.ts:35`)
     with an `actorId` filter + a user dropdown next to the existing action
     filter.
   - **Enrich entries**: hearts show which topic was hearted; comments show
     the comment body. Note: hearts and comments are *not currently logged*
     to `activity_events` (only moderation actions are) — see Q4 for whether
     we log them going forward or synthesize the feed from the hearts/comments
     tables.
4. **Digest**: link each published topic in the email
   (`apps/api/src/email.ts:51-59`) to its permalink. Needs an absolute base
   URL (env var; custom-domain timetables use their domain).

## Workstream 7 — Hearts timestamps & archive cutoff

1. **Dashboard surfacing**: expose `hearts.createdAt` in dashboard queries
   (e.g. last-hearted time per topic, hearts-per-day) — schema already has it.
2. **Archive = a cutoff timestamp, not row-marking** (decided): "archiving"
   means setting a *count-from* date. Default = the timetable's `createdAt`.
   When archiving, the admin picks a timestamp, which may be in the past.
   Heart counts and weights ignore hearts with `createdAt < cutoff`.
   - Replaces the current `archivedAt` row-marking model
     (`archiveTopicHearts`, `packages/core/src/topics.ts:187`); the
     `hearts.archivedAt` column and re-heart reset logic can be retired
     after migration.
   - Storage (decided): **per timetable** — a single `heartsCountFrom`
     timestamp on the timetable (settings jsonb or column), edited from the
     timetable Settings page. The per-topic "Archive hearts" button on the
     card (`AdminTopicActions`) is removed along with the row-marking model.
   - Edge case: a heart placed before the cutoff still exists (unique row
     per user/topic), so the user's heart button shows "hearted" while not
     counting; un-heart + re-heart refreshes `createdAt` and counts again.
     UI should make the not-counted state legible to hosts in the vote
     breakdown.

## Workstream 8 — Visibility granularity (schema migration)

Expand `privacyEnum` (`packages/db/src/schema/enums.ts:5`) from
public/private/deactivated to five levels:

1. `public` — all topics, comments, and user bios visible.
2. `hosts_only` — only host bios and topics visible; no comments.
3. `no_comments` — all bios and topics visible; no comments.
4. `private` — members only (unchanged).
5. `deactivated` — admins only (unchanged).

Work: pg enum migration (existing rows keep their values); update
`canReadTimetable` (`packages/shared/src/permissions.ts:26`) into a
capability matrix (`canSeeComments`, `canSeeBios`, `canSeeNonHostContent`)
consumed by `buildFeed`, comment resolvers, the users page, and the settings
`<select>`s (`CreateTimetableForm`, `TimetableProfileForm`). Exact semantics
for anonymous vs. signed-in non-members need Q6.

## Workstream 9 — Elector features

1. **"My hearted topics" nav item** (electors): feed filtered to topics the
   viewer has hearted — either a query param on the feed
   (`/feed?hearted=me`) handled in `buildFeed`, or a dedicated route.

## Workstream 10 — Seed data updates

All driven by `dev-sample-data.md` + `packages/db/src/seed-dev.ts`.

1. More **host-only comments** (currently only 2) including threaded
   host↔admin exchanges.
2. **Threaded feedback on submitted topics** to exercise Workstream 5.3.
3. **~10–15 comments per topic, some threaded** across the ~92 topics, plus
   **5 topics with 100+ comments and multiple threads** (exercises
   auto-collapse and infinite scroll). **Format (decided, Q12)**: a one-time
   generator script produces the ~1,800 comments deterministically and
   **writes them into `dev-sample-data.md`** in the existing comment-list
   format; the seeder keeps parsing the fixture as the single source of
   truth. The fixture grows large but every comment stays inspectable and
   hand-editable.
4. **Richer markdown in topic descriptions**: headings, links, bold, italic,
   numbered lists (renderer already allows h1/h2/links).

## Suggested sequencing

| Order | Workstreams | Rationale |
|---|---|---|
| 1 | WS1 (quick wins), WS10 (seed) | Low risk, immediate QA-visible value; seed data unblocks testing everything else |
| 2 | WS3 (topic card), WS5 (admin topics) | Core product feedback; card restructure before profile hooks |
| 3 | WS6 (linking) after the permalink decision, WS7 (hearts) | Cross-cutting; touches dashboard/moderation/activity/digest |
| 4 | WS2 (sidebar/nav/onboarding), WS4 (profiles) | Bigger UI rework; profiles hook into the new card |
| 5 | WS8 (visibility), WS9 | Schema migration last, with the capability matrix informed by the users page and bios work |

---

## Open questions for clarification

1. **Infinite scroll**: build infinite scroll
2. **Hearts archive cutoff**: admins need to pick an explicit cutoff date ("ignore
   hearts before *date*") when archiving. when un-archiving hearts, only one heart per user per topic counts.
3. **"New since last login" highlight**: - track server side lastSeenAt and new is published since last visit or commented on since last visit.
4. **Activity feed scope**:  elector hearts and comments become logged activity events. activity feed can be updated per refresh for now (create an issue for follow up for live sync)
5. **Topic permalinks**: dashboard/moderation/activity/digest links need a
   target. OK to add a topic permalink page (`/t/[slug]/host/topics/<id>`)
6. **Visibility semantics**: 1. public: shows all topics, comments, and user bios, 2. hosts only: only shows host bios and topics, no comments to the public user (not signed in), 3. no comments: shows all user bios and topics, no comments to the public (not signed in user), 4. private (only invited people can see everything), 5. deactivated (only admins can see everything)
7. **Admin topic creation**: admin can be the owner when creating a topic, in the new *host* actions bar on the card — edit + unpublish, owner reassignment notify the new host - you have a topic. 
8. **"Last engaged" timetable**: last-visited-timetable pointer on the user
9. **Removing `/timetables`**: the main nav dropdown of timetables is enough
10. **Host name interaction**: one pattern (modal everywhere)
11. **Users page audience**: respect the new visibility levels for anonymous visitors on public
    timetables
12. **Seed comment volume**: OK to generate ~1,800 comments and document them in `dev-sample-data.md`
13. **Custom timetable icon**: in the selector dropdown and in the nav, as a "home" button
14. **Overview removal**:  `/t/[slug]` should redirect to the feed
15. **Single column**: all pages including settings and my topics (as host) should be single column. 

---

## Round 2 decisions (2026-07-06 discussion)

1. **Heart archiving = cutoff timestamp**: setting a count-from date
   (default: timetable creation date; admin may pick a past date). Replaces
   the `archivedAt` row-marking model. See Workstream 7.
2. **Permalinks**: `/t/{timetable-slug}/{host-slug}/{topic-slug}` — host
   segment intentional; topic gets a title slug (not UUID); users get slugs.
   Resolution by topic slug with canonical redirect, so reassignment doesn't
   break links. See Workstream 6.
3. **Reassignment notification**: line in the new owner's next digest;
   follow-up issue for immediate email.
4. **Single column everywhere**, including dashboard stat tiles and settings.
5. **Seed comments**: generated deterministically, then written into
   `dev-sample-data.md`; the fixture stays the single source of truth.
6. **People page**: "Users" tab is named **People**, visible to admins,
   hosts, and electors.

Navigation decisions (earlier in the same discussion): Airtable-style
timetable dropdown lives in the global `header.topbar` (not the sidebar);
brand logo links to the last-visited timetable's feed; the dropdown trigger
doubles as the home button; switching timetables always lands on the feed.

Assumed defaults (unobjected): signed-in non-members are treated like
anonymous visitors under `hosts_only`/`no_comments`; the "new since last
visit" highlight tracks `lastSeenAt` per membership, updated on feed view.

**Resolved (round 3)**: the hearts count-from cutoff is **per timetable** —
one `heartsCountFrom` timestamp, edited in timetable Settings; the per-topic
"Archive hearts" card action goes away. Host-name permalinks with canonical
redirects and the ~10x seed fixture growth were both confirmed.

**All decisions are now made — no open questions remain.**