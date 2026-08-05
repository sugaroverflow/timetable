# Product

Topic (topic.forum) helps a community decide what it wants to talk about —
and when. Hosts propose topics they could run a session on; electors signal
what they want with weighted ❤️s; everyone shares their availability; and
admins (or hosts directly, per forum policy) turn the most-wanted topics into
a schedule of sessions. Booking and publishing the resulting events
deliberately happens elsewhere — an event page, Luma — Topic is the layer
where a group decides and coordinates, then points at the result.

It is a multi-tenant web app: each forum is an independent workspace with its
own members, roles, theme, and settings, and one person can belong to many
forums with different roles in each.

A few product stances shape most features:

- **Weighted voting, not raw likes.** An elector who ❤️s everything counts
  for less per ❤️ than one who chooses carefully. Several normalisations of
  the same votes are available because different questions ("what has broad
  support?" vs "what do people care most deeply about?") deserve different
  math.
- **One person, one gesture per topic.** Nobody gets two votes by holding
  two roles.
- **A decision venue, not a social network.** There are no followers, no
  engagement mechanics, and the default feed order is a shuffle rather than
  a popularity ranking.
- **Coordination over automation.** The calendar surfaces who-can-make-what
  and lets people claim and confirm slots, but collisions stay conversations
  and booking happens outside the product.

**A note on names:** the product was built as "Timetable" and the code keeps
that name — packages, database tables, and internal identifiers say
`timetable` where the UI says **forum**. This document uses the product
language; see [ARCHITECTURE](ARCHITECTURE.md) for how the boundary is drawn
in code.

## Forums, Members, Roles

Roles are scoped to forum membership:

| Role | Can |
| --- | --- |
| Owner | Everything an admin can do, plus protected ownership of the forum |
| Admin | Moderate topics, create topics for any host and reassign them, see every host's submitted topics, hide comments, manage members and their bios from the People page, edit settings and theme, set the ❤️ cutoff, set up the calendar schedule and pencil/confirm sessions, view Analysis |
| Host | Propose and submit topics, edit their own topics, see weighted-❤️ breakdowns, use the host-only thread, 💙 colleagues' topics (host-non-electors only), join slot discussions, pencil in / propose / confirm sessions per the forum's calendar policy, view Analysis |
| Elector | Read published topics, ❤️ and comment on them, collect "My hearted topics", share availability (weekly pattern + per-slot answers) |

Each forum can rename its roles (e.g. Admin → Dean, Host → Faculty, Elector →
Fellowship Candidate); the custom labels are used throughout the UI. Every
member has a markdown bio, shown in a popup from any byline, on the People
page (members grouped by role; hosts list their published topics), and on
their own person page at `/f/{forum}/{member}`.

A member whose roles have all been removed keeps the forum in their switcher
but otherwise sees what an anonymous visitor sees at the forum's visibility
level: no composer, no ❤️s, no People page, no member-only panels. Admins can
also remove members outright from the People page (the owner can never be
removed).

## Topics

Hosts (and admins) write topics in a rich-text editor; markdown is the stored
format. A new topic is created as `submitted` and is immediately publishable
by an admin — there is no separate draft status. Pre-publish feedback happens
in the topic's **drafting thread**: admin-only comments that the topic's
owner can also see and reply to, never rendered in the feed. Pending Topics
shows the submitted queue.

Admins publish, unpublish, edit inline, hide comments, reassign a topic's
owner, and can create a topic on behalf of another host. A forum can instead
let **hosts publish their own topics without review** (Forum Settings) —
admin review becomes after-the-fact oversight, and every publish is
activity-logged either way.

Published topics get stable permalinks (`/f/{forum}/{host}/{topic}`; slugs
freeze at first publish).

## The Feed

"All Topics" is a single-column feed with infinite scroll. It sorts by ❤️s
(any of the four normalisations below), latest comments, newest (content
edits count as new, without triggering email), or **Shuffle** — a seeded
random order, and the default. Topics published or edited since the member's
last visit are highlighted, and filtering by a host shows their profile card
above their topics.

Electors also get the **Topic Queue**: one unhearted topic at a time in a
per-user stable shuffle with big 🔁/❤️ decision buttons — a low-friction way
to work through everything they haven't voted on yet, round by round.

## ❤️s and Weighting

Electors ❤️ published topics; each hearted card shows the elector their own
"your vote: 1/n" weight. Hosts and admins see weighted scores and
per-elector breakdowns; electors see only the public feed.

❤️ weighting comes in four normalisations, shared by the feed sort control
and the Analysis tables:

| Mode | Formula | Meaning |
| --- | --- | --- |
| Total hearts | Σ❤️ | Every ❤️ counts equally (L∞) |
| Enthusiasm (L2) | Σ 1/√n | Discounted by the square root of each elector's total ❤️s |
| One vote each (L1) | Σ 1/n | Each elector splits one unit of influence across their ❤️s |
| Average devotion | (Σ 1/n)/Σ❤️ | The mean share of their ❤️s that this topic's supporters gave it |

where `n` is the number of published topics that elector hearted.

The per-elector breakdown is a sortable table: one row per elector with
their L1, L2, and devotion contributions plus when they hearted, with footer
sums that match the topic's scores; elector names open their profile card.
The same table appears on feed cards (for hosts and admins) and in Analysis.

Admins can set a forum-wide **❤️ cutoff**: hearts created before it are
ignored in every count and weight — a clean way to restart voting for a new
term without deleting anything. A pre-cutoff ❤️ shows as unhearted
everywhere, and hearting again revives it.

Every ❤️ and 💙 add/remove is also appended to an immutable `heart_events`
ledger that the app never updates or deletes and the cutoff never filters,
so past voting rounds stay reconstructable across resets. Its one surface
is an admin-only `heartEvents` section in the data export.

### Host 💙s

Hosts who are **not** electors get a parallel gesture: 💙. One person, one
gesture — a dual-role member's ❤️ is their gesture, so in forums where every
host is also an elector nobody is eligible and the feature self-disables.
Invariants, held everywhere:

- 💙s never enter elector weighting, feed ranking, or any decision surface —
  electors never see them at all.
- Attribution is host-visible (the "💙 Sarah, Amir" row in the host-only
  thread, and 💙 lines in the host's digest); tallies, normalisations, and
  sorting are **admin-eyes-only** in Analysis — no peer leaderboard.
- 💙s are unaffected by the ❤️ cutoff (interest, not a ballot).

Hosts 💙 from the topic card's actions row and the Topic Queue (bound to 💙
for them), and collect them on a "💙 Topics" page. Admins get all four
normalisations as extra Analysis sort options, with hosts (instead of
electors) in the per-topic breakdown, plus a "💙 given" column in the
host-activity table.

## Comments

Topics carry up to three comment threads:

- a **public thread**, threaded and auto-collapsed;
- a **host-only thread** with its own composer, labelled with the forum's
  host label — a forum option (default on; sensible to switch off where
  hosts and electors are the same people). Switching it off hides the thread
  and the 💙 attribution row without deleting anything; 💙s keep working as
  private bookmarks only admins see in Analysis, and drop out of digests;
- the **drafting thread** described above.

Comments support @mentions, which notify the mentioned member. Authors can
edit and delete their own comments; admins can hide them.

## Calendar

The calendar helps hosts find times their people can make and see what's
already spoken for. It is **off by default** — a forum switches it on in
Forum Settings, which adds the Calendar nav link and page. Turning it off
hides everything again; nothing is deleted. Each slot can carry a URL
pointing at the real event page once one exists.

**Schedule = pattern × terms.** Admins define weekly time cells ("Tue and
Thu 19:00–21:00") and named date ranges ("Michaelmas, 29 Sep–12 Dec"); slots
are generated from the cross product (idempotently — regeneration skips
existing slots). One-off slots can still be added by hand. A weekend
unconference is the same model with hourly cells and a two-day range.

**Elector availability is layered** — "we use whatever availability
information you share":

1. an explicit 🟢🟡🔴 answer on a slot
2. their weekly pattern — a grid of exactly the admin's schedule cells,
   painted once and inherited by every generated slot
3. nothing shared → 🟡 (maybe)

**Sessions.** Each slot carries at most one session — **a topic, or a
host's "office hours"** (a typed topic-less session whose subject is the
host; its display label is a forum setting, "Office hours" by default,
never per-session free text) — plus a status: `empty` (open) → `proposed`
(pencilled in, under discussion) → `confirmed` (happening; the URL points at
the real event page, rendered as a "register" pill). Who may pencil/confirm
is a forum setting expressed as two switches (hosts may pencil / hosts may
confirm; both off = admins schedule everything). A host only ever acts on
their own topic or their own office hours and never displaces another
host's session — collisions stay conversations. Hosts can also propose
off-piste slots at any time/location; those are born `proposed` and collect
availability immediately.

**The calendar page** is a compact table (rows fold open via a 💬 bubble).
The calendar wears two hats — upcoming events and scheduling workbench — so
a slot-state filter (All slots / Sessions / Open slots) gives each its own
view. Availability meters render as slim count-only bars while scanning; the
full meter — elector avatars sitting inside their 🟢/🟡/🔴 stretch,
host/admin-only — appears when a topic lens is active or a row is folded
open. The lens filters every meter to the electors who ❤️'d that topic;
group availability is hidden from electors, who see only their own toggle.
Slot discussions ("host chat") support claim comments that attach the active
lens topic plus a frozen server-computed availability snapshot ("I'd like
this slot for Yoga · 4🟢 8🟡 2🔴"); slot comments have the standard author
edit/delete and admin hide/unhide controls.

Past slots are archived out of the default view ("Show past" reveals them);
until slots exist the whole page and nav link hide from non-admins.

**Around the calendar:** pencil/confirm/clear/propose/schedule/comment/
availability actions land in the activity log, and hearters of a topic get
in-app notifications when its session is pencilled, confirmed, or cleared.
The ICS feed maps proposed/confirmed onto RFC 5545 `STATUS:TENTATIVE`/
`CONFIRMED` and carries the session URL; it 404s while the calendar is
disabled. In digests, a hearter's upcoming confirmed sessions ride their
topic's card (in every digest until the session happens, with a
Register → URL link) and proposed sessions appear as a "Can you make it?"
section; stale listings alone never trigger an email. Office-hours sessions
reach people via the calendar page and ICS only (notifications and digests
key off topic ❤️s).

## Admin and Settings

Admin surfaces:

- **Pending Topics** — every host's submitted queue
- **Activity timeline** — grouped by week and day with a date-range filter,
  actor avatars/roles, filters by action type, actor, and role, and enriched
  entries (comment text with a link to the comment, invites, first sign-ins)
- **People** — member and role management (roles + markdown bios), adding
  people, and sending their invite emails
- **Analysis** — topics table with ❤️ and 💬 normalisations, per-table host
  filters, an elector activity table with per-row topic folds, and an
  admin-only host activity table
- **Forum Settings** — name, visibility, custom role labels with a live
  preview sentence, digest defaults, calendar setup and policies, the topics
  policy (hosts publish directly), the host-thread option, the ❤️ cutoff,
  and the custom domain field (marked "coming soon" — routing is not wired
  up yet)
- **Theme** — primary/secondary/background/topbar/text colours with live
  preview, curated font pairings, a dark-mode palette, cover image, and icon

Adding a member is a two-step flow so their first sign-in lands in a
ready-made account. An admin adds the person from the People page — this
silently creates their account and membership, with no email sent — then
populates their profile and creates topics on their behalf. When everything
is ready, the admin explicitly sends the invite email (which mentions how
many topics are waiting). Each member card shows its invite state ("Not
invited yet" / "Invited 12 Jul") with a Send/Resend button, alongside View
as and Edit profile actions.

Navigation is a left sidebar (a slide-in drawer on mobile) with the forum
switcher — including a visibility pill per forum and "New forum" — in its
footer. The topbar shows the current forum's icon and name, plus a personal
light/dark/auto toggle (the forum's theme defines both palettes). New users
with no forum land on the create screen; returning users land on the feed of
the forum they last engaged with.

Profile images, topic covers, icons, and forum covers can be pasted as image
URLs or uploaded through the app to object storage.

## Privacy

Forum visibility is enforced server-side across five levels:

| Mode | Read Access |
| --- | --- |
| `public` | Anyone can read topics, public comments, and member bios; sign-in is still required to ❤️ or post |
| `hosts_only` | Topics and host bios are public; comments and non-host bios are hidden from non-members |
| `no_comments` | Topics and all bios are public; comments are hidden from non-members |
| `private` | Members only |
| `deactivated` | Admins only |

Members always see everything their role allows, regardless of level.

## Notifications and Email

In-app: each forum has a Notifications pane listing comments on the member's
topics, replies to their comments, @mentions of them, and session changes on
topics they ❤️'d, each linking through; an unread badge in the sidebar
clears when the pane is opened.

For email, users can opt into digest sections:

- new published topics
- replies to their comments
- activity on their hosted topics (including topics reassigned to them)

Admins can set forum digest defaults, applied to new members who have never
customized their own preferences. Digests are sent through Resend by a
scheduled job; a member who was pre-created by an admin but never invited is
skipped entirely, so nobody hears about a forum before their invite. Invite
emails go through the same plumbing and are only ever sent when an admin
explicitly triggers them.

Calendar sync is one-way ICS export
(`GET /api/forums/:idOrSlug/calendar.ics`); private forums require a
per-user ICS token. There is also a public Atom feed of newly published
topics, a read-only JSON export of a forum's readable data (the forum's
"API" page), and Open Graph social cards for forums, topics, and people.

## Status

The product is live at [topic.forum](https://topic.forum), with hosted dev at
dev.timetable.love. Feature history lives in
[docs/execution-journal](execution-journal/) (one entry per notable change)
and the git log — this document describes the present.

### Known gaps

- Custom-domain hostname routing is wired in the web proxy, but per-forum
  DNS/Clerk setup is not productised — the settings field is labelled
  "coming soon".
- Email digest is the only email channel; Slack, push, and others are not
  started. No immediate email on topic reassignment yet (#57).
- The digest and invite email templates are provisional — the product's
  emails have not been designed yet.
- The in-app notifications pane has no per-item read state or mark-all-read.
- The activity feed is refresh-based, not live (#58).
- Calendar sync is one-way ICS export only. Importing electors' personal
  calendars (a secret ICS URL fetched server-side, deriving busy/free per
  slot as a layer between explicit answers and the pattern) is the designed
  next step, not started.
- Calendar times have no forum-timezone setting: slot generation runs on the
  admin's browser clock, the app renders viewer-local, and digest emails
  format in UTC — fine while forums are single-timezone, wrong the day one
  isn't.
- The forum data export and API page exclude timeslot/availability data;
  adding calendar data to the export surface is an open todo.
- Feed pagination is offset-based behind infinite scroll; cursor pagination
  is a future scalability item.
- A full copy review is an open todo: read every user-facing string in one
  pass and check the tone matches across the product (per-surface copy has
  accreted PR by PR).

### Operational follow-ups

- Tune GraphQL depth/cost limits and database-backed rate limits as real
  traffic patterns emerge.
- Route structured request/error logs into hosted error reporting or log
  drains.
- Keep auditing `deactivated` privacy and activity logging on new mutations.
- Expand fail-fast environment validation beyond the current production
  checks.

### Testing gaps

Committed tests cover weighted-❤️ behavior, GraphQL depth/cost validation,
rate-limit behavior, API endpoint smoke (health, REST auth boundaries,
invites, memberships, uploads, digest cron, ICS), anonymous Playwright smoke
for `/`, `/sign-in`, `/sign-up`, and hosted deploy smoke. Priority next
tests:

- authenticated browser workflows (needs a Clerk test-user harness)
- topic lifecycle across submitted → published → unpublished
- broader GraphQL role/permission fixtures
- performance regression fixtures for feed/dashboard once pagination or
  dataloaders land

### Performance risks

- `buildFeed` loads all forum ❤️s for published topics on every call, and
  Analysis derives weighted data through the same path.
- Some GraphQL field resolvers perform per-row lookups.
- The digest job is O(users) and should be revisited before large-scale
  usage.

Potential future fixes: dataloaders for GraphQL resolvers, materialized
weighted scores, cursor pagination, a job queue for digests, and database
indexes based on production query plans.
