# CLAUDE.md

Guidance for AI coding agents working in this repo. Humans: see `README.md`.

Timetable ("Sparkle Bureaucracy") is a multi-tenant app where hosts propose
topics, electors vote with weighted hearts, and admins publish and schedule.
Product context: `docs/PRODUCT.md`. Architecture: `docs/ARCHITECTURE.md`.

**Rebrand (2026-07):** the product is now branded **"Topic"** (topic.forum),
and the tenant entity is a **"forum"** in ALL user-facing copy. Code
identifiers, `@timetable/*` packages, DB tables, and the `/timetables` web
route deliberately keep `timetable` naming — new user-visible strings must
say forum/Topic.

**Public API naming (2026-07-27):** the PUBLIC API surface says **forum** —
GraphQL exposed types/fields (`Forum`, `forum(idOrSlug:)`, `myForums`,
`forumHosts`, `updateForumSettings`, `forumId`, …) and REST URLs
(`/api/forums/…`). The web app's own queries alias back to the internal
names (`timetable: forum(idOrSlug: $s)`) so TypeScript keeps `timetable`
identifiers — follow that pattern in new queries. Legacy
`/api/timetables/:idOrSlug/{calendar.ics,feed.atom}` 301-redirect (URLs
live in calendar apps/feed readers — never remove).

**Naming pass (2026-07-27, de-social-media):** forum URLs are `/f/[slug]/…`
(old `/t/` permanently redirects — never remove those redirects, sent
emails link there). The browsing page is **"All Topics"** at `/topics`
(never "feed" in user-facing copy); the host's own page is "My Topics" at
`/my-topics`; the random sort's label is **"Shuffle"** (its value stays
`random`); the admin settings nav is "Forum Settings". User-facing text
uses the **"❤️" emoji instead of the word "heart"** where it reads
naturally. Internal identifiers (`buildFeed`, `InfiniteFeed`,
`lastSeenFeedAt`, CSS `feed-toolbar`, sort value `random`) keep their
names.

## Monorepo map & boundary rules

npm workspaces (Node ≥ 20):

| Workspace | What it is |
|---|---|
| `apps/web` | Next.js 16 App Router + React 19, Base UI, Lucide icons, Clerk auth |
| `apps/api` | Express 5 + Pothos GraphQL (`graphql/schema.ts`) + REST (`rest/router.ts`) |
| `packages/core` | Business logic (topics, invites, digests, analytics…) — Drizzle queries live here |
| `packages/shared` | Pure domain logic + types (zod only): roles, permissions, hearts math, settings types |
| `packages/db` | Drizzle schema + migrations (Postgres 16) |

Dependency DAG (never violate): `shared ← db ← core ← api`, and `shared ← web`.
**The web app never imports `@timetable/core` or `@timetable/db`** — it talks to
the API over HTTP only. Types needed on both sides go in `packages/shared`
(see `shared/src/settings.ts` for the pattern).

Web data access goes through `apps/web/src/lib/transport.ts` via the four
wrappers `gqlFetch`/`clientGql` (GraphQL) and `apiFetch`/`clientApi` (REST) —
don't hand-roll `fetch` to the API. Reads are GraphQL; membership/invite/
timetable writes plus uploads/cron/ICS are REST. **This split is intentional —
do not unify the surfaces.**

## Build, test, run

- `npm run db:up` (Postgres via Docker) → `npm run db:migrate` → `npm run db:seed`
- `npm run dev` (api :4000 + web :3000), or `dev:api` / `dev:web`
- Dev sign-in: seeded Clerk test users, email OTP code **424242**
  (`npm run clerk:seed-dev-users`; re-sign-ins hit a resend cooldown — wait for
  "Resend (n)", click it, then type the code)

Every PR must keep green (CI enforces this):
`npm run build` · `npm run typecheck` · `npm run lint` · `npm run format:check`
· `npm run test` · `npm run test:e2e` · `npm run db:migrate` when
schema/migrations change. Run `npm run format` before committing (Prettier
defaults; YAML/Markdown are exempt — deploy specs are sed-templated).

Tests are vitest (`packages/shared`, `apps/api`, `apps/web`) + one Playwright
smoke suite (`tests/e2e/`) — it always starts its own web server on port 3100
(override with `PLAYWRIGHT_PORT`), so it coexists with a running dev stack.
Follow existing patterns:
`apps/web/src/lib/transport.test.ts`, `packages/shared/src/hearts.test.ts`.
Lint covers everything: `apps/web` has its own Next config; the root
`eslint.config.mjs` lints `apps/api`, `packages/*`, `tests/`, `scripts/`.

## Git & deploy workflow

- `main` is protected: **no direct pushes** — branch + PR, the CI `verify`
  check must pass, then merge (no human review required;
  `gh pr merge <n> --auto --squash` is the norm).
- Merging to `main` **auto-deploys dev** (dev.timetable.love) when CI is green.
  A red CI on main makes Deploy Dev show as `skipped`, not failed — check
  `gh run list --workflow=deploy-dev.yml` after merging.
- **Never run `deploy-production.yml` or touch the `topic-prod` (prod) DO app —
  production deploys are human-triggered only.** Same for repo settings,
  rulesets, and DO infrastructure (`doctl`).
- Never commit secrets. Env shape lives in `.env.example`.

## Conventions

- Notable changes get an entry in `docs/execution-journal/YYYY-MM-DD-<slug>.md`
  (see existing entries for the format) and update `docs/ARCHITECTURE.md` if
  the structure changed.
- Styling is a two-tier token system: semantic tokens in
  `apps/web/src/app/tokens.css` (light + dark), global classes in
  `globals.css`. Use `var(--token)` — no hardcoded hex in CSS, no inline color
  literals. Fonts/spacing/z-index come from the scales in `tokens.css`.
- UI primitives come from `@base-ui/react` (Dialog, Menu, Toast, …); icons
  from `lucide-react`.
- Per-timetable permissions: check `packages/shared/src/permissions.ts`
  (`canModerate`, `canManageMembers`, …) — don't test roles ad hoc.

## Part names (glossary)

Stable names for feature pieces, so instructions can reference them precisely.

- **comment-tree-fragment** — `commentTree()` in `apps/web/src/lib/gqlFragments.ts`:
  generates every thread query's nested reply selection to `COMMENT_TREE_DEPTH`
  levels. Deeper comments exist server-side but are never fetched.
- **reply-depth-guard** — in `CommentList.tsx`: withholds reply composers at
  the deepest fetched level so nobody can post a reply the page can't show.
- **reply-indent** — `.replies` in `globals.css`: the per-level thread indent
  (6px + 2px rule).
- **top-composer** — the new-strand comment composer at the TOP of each
  comment stack; top-level comments sort newest-first to match.
- **chain-tail-composer** — `ChainTailComposer.tsx`: the slim "Continue this
  thread…" input ending every dialogue chain. Posts root-attach (message
  becomes a child of the chain's parent comment, Slack-style), so chains
  never deepen; `?reply=` deep links focus it.
- **comment-teaser** — `CommentTeaser.tsx`: feed/queue cards' collapsed
  discussion under the always-visible composer — previews new top-level
  comments (vs the per-topic `comment_seen` watermark, padded to the three
  latest) + a "💬 n comments" pill that reveals the tree; the permalink
  page passes `discussionOpen` and skips it. "Seen" = engagement only
  (teaser expand / permalink visit via `markCommentsSeen`), never feed
  scrolling. My Topics teases too (Ed, 2026-08-16) — hence
  `ManagedTopic.viewerCommentsSeenAt` and the `CommentsOpenScope` around
  its strip; only the PUBLIC thread teases, faculty/drafting open fully.
  `CommentsOpenScope` carries TWO channels: `requestOpen` (💬 button,
  posting — never folds) and `requestToggle` (clicking the Comments tab
  you're already on — opens, then folds back; Ed, 2026-08-16).
- **chain-reply digests** — `loadChainScope` in `packages/core/src/digests.ts`:
  the `replies` digest kind covers new comments in chains the recipient is
  part of, batched per chain by the email's thread merge. All comment kinds
  suppress against `comment_seen` (engagement), not page watermarks.
- **topic-tabs** — `TopicTabs.tsx` (generic strip) + `MyTopicsTabs.tsx`
  (My Topics assembly) + `buildTopicTabs` in `TopicCard.tsx`
  (feed/permalink/queue): a topic card's parallel spaces — the comments
  tab / {host}-only tab / drafting tab / sessions tab / Scheduling tab —
  render as one horizontal strip when ≥2 are live, and bare (the pre-tabs
  presentation) when only one is. Ed's vocabulary (2026-08-15): the strip
  is "topic-tabs", a pane is "the sessions tab", "the comments tab", …
  Inactive panels unmount, so lazy fetches stay lazy; on feed cards the
  💬 button / top-composer snap the strip back to Comments through
  CommentsOpenScope. The collapsible `HostOnlyPanel` wrapper is gone
  (2026-08-14); `AdminCommentsPanel`'s survives on permalink + moderation.
  The strip never wraps (QA 2026-08-15): under 640px with ≥3 tabs the
  UNSELECTED labels are clipped to icon + count (scrolling is only a last
  resort), its bottom rule is an inset shadow (a scroll container would
  clip a hung underline), and `.topic-tab-panel` suppresses its first
  block's own top rule so a tab never opens on a doubled line.
  **The strip sits ABOVE the action bars** (Ed, QA 2026-08-15): ❤️ leads
  the Comments tab, 💙 leads the {host}-only tab, so exactly one action
  bar is on screen and its 💬 count is unambiguously that thread's. Hence
  the Comments tab is unconditional on feed cards — it carries the ❤️.
  Queue mode is the exception: its decision buttons stay above the strip
  (one call to action per card) and the Comments tab has no ❤️ row.
  **Tabs never vanish** (Ed's rule, 2026-08-15): once a tab has appeared on
  a topic it stays, so the drafting tab rides EVERY card its people see
  (owner or admin; `adminComments` is in `TOPIC_FEED_FIELDS`, batched in
  `decorateFeedTopics`, and the permalink's old DraftingThread panel is
  gone), and the {host}-only tab shows from publication onward rather than
  only when it has content.
- **topic-workbench** — `TopicScheduleBody` in `TopicSchedulePanel.tsx`,
  the Scheduling tab of topic-tabs (published, calendar on): per-topic
  mini-calendar — the topic's hearters' availability across future slots
  (`topicSlotFit` query, lazy on tab open) as washed rows (shared
  `CalendarRowWash.tsx`) with the avatar fold, a Date/Availability sort
  toggle (🟢 dominates 🟡), and pencil/unpencil per row. By date the rows
  group under month headings with week gaps (calendar idiom; past slots
  excluded server-side); by availability the list is flat and ranked, with
  years on every date. The panel leads with a **"Your sessions"** group
  (QA 2026-08-16): this topic's pencilled/confirmed slots pinned at the
  top, avatars locked open, no fold — and they ALSO stay in place in the
  list below (Ed's call: the date list keeps no holes).
  Each row also names the OTHER sessions already on
  that slot (`others` on `topicSlotFit`; ✎/✓ + label, QA 2026-08-15) —
  company, not conflict, since pencils never contend.
  No discussion here — that's the calendar page.
  Part of demand-first scheduling (2026-08-14): ❤️ implies "I'd attend"
  (never stated in UI copy), and a **pencil is a location-less
  time-intent** — the host saying "I am available at this time"; unique
  per slot+topic, locations never contend (migration 0037); the room is
  assigned at confirm time (confirms are exclusive per slot+location,
  migration 0038).
- **sessions-tab** — `SessionsTabBody.tsx`, the Sessions tab of
  topic-tabs on feed/permalink/queue cards ONLY (My Topics keeps the
  host's Scheduling tab instead): every future slot where the topic is
  pencilled/confirmed, lazily fetched on tab open (`topicSessions` query;
  the `sessionSlotCount` scalar on feed topics gates the tab without
  fetching rows), each row a date/time + SessionLine-style status pill
  and — electors only — the inline 🟢🟡🔴 toggle, which IS the elector's
  existing per-slot calendar write (`AvailabilityControl` /
  `setAvailability`, re-homed). Visible to anyone who can see the card,
  anonymous included (viewerState null). NO group washes/counts/avatars
  by design — electors seeing group availability is a deferred privacy
  question; never leak counts or perUser here.
- **digest click-to-read** — `digest_sends` table + `stampDigestLinks`
  (api `email.ts`) + `DigestReadMarker` (app layout): every digest link
  carries `dg=<send id>`; one click marks that email's shown comment
  threads seen up to its send time (`markDigestRead`, GREATEST semantics).

## Gotchas (learned the hard way)

- Postgres `ALTER TYPE … ADD VALUE` can't run inside a transaction — Drizzle
  migrations must **recreate the enum** instead (see migrations 0013/0014).
- "Draft" means two things historically: the draft **topic status is removed**
  (dead references may lurk), but the "**drafting thread**" — `admin_only`
  comment visibility — is a live feature. Never blanket-delete "draft" matches.
- `apps/web/.next/` build output pollutes searches — scope greps to `src/`.
- Seed fixture bodies in `dev-sample-data.md` must not contain `^## ` lines
  (breaks the section parser); `###` is safe.
- React 19 re-applies `dangerouslySetInnerHTML` on the first post-hydration
  update even when `__html` is unchanged, recreating the children. Any DOM
  patched inside such a container (see `CollapsibleTopicBody`) must be
  re-applied in an every-commit layout effect, not keyed on props.
- The API refuses to boot when `SPACES_BUCKET` is set without
  `SPACES_KEY`/`SPACES_SECRET` — keep app specs and workflow env in sync.
- Modules bundled into Next's `opengraph-image` routes (`lib/ogCard.tsx` and
  anything it imports) must NOT import `@timetable/*` workspace packages —
  the OG routes' separate compilation can't resolve them (typecheck passes;
  the dev server then fails at request time and e2e times out). Keep those
  modules dependency-free; duplicate small constants locally with a comment.
- Drizzle raw `sql` templates with Date params (`` sql`${col} >= ${now}` ``)
  bypass the column's Date mapping and THROW at runtime on hosted Postgres
  while passing every local check — always use `gte`/`lte`/`eq` operators
  for date comparisons (calendar-v2 dev outage, 2026-07-31).
