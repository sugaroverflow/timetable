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
Web COMPONENT tests (jsdom + `@testing-library/react`, since queue-keys
2026-09-07) opt in per file with a `// @vitest-environment jsdom` docblock
— node stays the default so pure lib tests don't pay for a DOM. Pattern:
`apps/web/src/components/QueueControls.test.tsx` (mock `next/navigation`,
`@/lib/clientGraphql` and `@/components/Toast` through `vi.hoisted`).
`vitest.config.ts` sets `oxc: { jsx: { runtime: "automatic" } }` because
Vite 8 transforms with Oxc and tsconfig's `jsx: preserve` (which Next
needs) would otherwise leave JSX untransformed. **jsdom is pinned to ^29
and declared at the ROOT** (2026-09-10): jsdom 30 needs Node ≥ 22.22 (its
undici 8 calls `worker_threads.markAsUncloneable`), and CI + the prod
image run Node 20; and vitest resolves the environment package from the
root `node_modules`, where npm would not reliably hoist a workspace-only
devDependency (CI failed with "Cannot find package 'jsdom'" until the
root declaration). Verified under a Node 20 binary locally.
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
- **Term-time migration policy (2026-08-21):** while a real programme is
  running, migrations are **additive only** — add columns and tables; never
  drop, rename, or narrow one. Migrations run PRE_DEPLOY and a code rollback
  does NOT roll back the schema, so an additive-only rule is what makes every
  deploy safely reversible. Clean up dropped columns in the holidays.
  See `docs/OPERATIONS.md` R11.

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
  page passes `discussionOpen` and skips it. Clicking a preview line
  opens the tree focused on that comment's chain-tail composer (a shallow
  `?reply=` write into the existing deep-link focus; the pill opens
  unfocused), and previews + pill are indented to the comment text column
  (36px) with 4px extra air under the composer (Ed, QA 2026-08-16).
  "Seen" = engagement only
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
  presentation) when only one is — except My Topics, which passes
  `stripWhenSingle` so even a drafting-only card wears the strip (Ed,
  2026-08-16). Ed's vocabulary (2026-08-15): the strip
  is "topic-tabs", a pane is "the sessions tab", "the comments tab", …
  Panes mount LAZILY on first activation and then STAY mounted — measured
  on dev 2026-08-21: a fresh card has exactly one panel in the DOM (the
  selected one), visiting a tab adds its panel, and leaving never removes
  it (Base UI unmounts only when a close transition completes, and these
  panels have none). So each pane's fetch still doesn't fire until you
  open its tab, but nothing is torn down when you leave — and a deep link
  must NAME its tab (`?tab=`, see comment-draft-store and the notification
  links), because an unvisited pane is not in the page at all. The older
  note here said inactive panels unmount; they don't. On feed cards the
  💬 button / top-composer snap the strip back to Comments through
  CommentsOpenScope. The collapsible `HostOnlyPanel` wrapper is gone
  (2026-08-14); `AdminCommentsPanel`'s survives on permalink + moderation.
  The strip never wraps (QA 2026-08-15): under 640px with ≥3 tabs the
  UNSELECTED labels are clipped to icon + count (scrolling is only a last
  resort), its bottom rule is an inset shadow (a scroll container would
  clip a hung underline), and `.topic-tab-panel` is a 10px-gapped stack
  (the `.thread-stack` rhythm) that suppresses nested top rules AND the
  card-level `margin-top: -13px` pulls — those cancel the card's 14px
  stack gap, which a tab panel doesn't have, so inside one they just
  overlapped the ❤️ pill (QA 2026-08-16).
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
  the Scheduling tab of topic-tabs (published, calendar on): a per-topic
  mini-calendar built from the CALENDAR'S OWN ROWS (`CalendarTable` — one
  row implementation since 2026-08-16; the parallel one is what let the
  surfaces drift). `topicSlotFit` returns calendar slots scored against
  this topic's hearters, lazily on tab open. Four things stay local: the
  wash is this topic's hearters; each row's right cluster carries a
  one-click Pencil in / Unpencil (`CalendarTable`'s `rowAction`); a
  Date/Availability toggle (🟢 dominates 🟡) where ranked = ungrouped =
  years on every date; and the past is off until you press Show past
  (state here, via the controls row; the calendar page keeps its own
  `?past=1` link through `pastToggle`). Everything else is calendar
  behaviour:
  rooms, session lines, the avatar fold, the slot chat (a post from here
  carries this topic's claim chip), session and admin controls in the
  fold. Two bare sections (`card={false}` — no inner cards, quiet
  `.cal-subhead` headings, no counters; Ed, QA 2026-08-16), each folding
  by its heading (`collapsible`): **"Your Sessions"** (this topic's
  upcoming pencils/confirmations as ordinary rows, also present in the
  list below) and **"Calendar"** — under whose heading a controls row
  (`CalendarTable`'s `controls`) carries the Date/Availability sort
  toggle on the left and Show past on the right, since that list is what
  they act on (Ed, QA 2026-08-16 round 3; the "Availability of the n ❤️"
  helper line is gone, only the zero-❤️ explainer remains). The calendar
  page leads with its own **"Your Sessions"** card (`MySessions` in
  `calendar/page.tsx`): the viewer's future topic sessions + office
  hours, read off the UNFILTERED calendar and repeated in the chronology
  below.
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
  fetching rows) and rendered as CALENDAR ROWS (`CalendarTable`, ungrouped
  so dates carry the year, bare — `title={null} card={false}`, the tab
  strip is its heading — 2026-08-16, decision 13). A viewer gets what
  the calendar page would give them: bookings, rooms, their own 🟢🟡🔴,
  the slot chat behind the fold; the wash stays host/admin-only because
  `counts` is gated everywhere, and charts THIS topic's hearters (the
  workbench's audience; Ed, QA 2026-08-16). Non-admin hosts get NO
  pencil-in control here (`canPropose` stripped — it could only
  cross-book their office hours into someone else's topic; booking
  gestures live on the calendar and the workbench; Ed, QA 2026-08-16).
  `topicSessions` builds ONLY this topic's
  slots (`listTopicSessionSlotIds` → `buildCalendar({ slotIds })`), never
  the forum's whole schedule. No lens: a comment posted from a card is a
  plain slot comment — claiming a time is the calendar's and the
  workbench's gesture.
- **comment-timestamp-permalink** — `CommentTime` in `CommentList.tsx`
  (#259): the faint relative timestamp in every comment's name row, linking
  to `<topic permalink>#comment-<id>` (anchor + :target ring from the
  2026-08-17 log overhaul) wherever the thread gets `topicHref`.
- **comment-pinning** — #258 (Ed, 2026-08-17): the TOPIC's author (only —
  not admins) gets Pin/Unpin in the comment-actions row of top-level public
  comments; `pinComment` mutation → `comments.pinnedAt` (migration 0041),
  📌 in the name row. The SERVER tree stays newest-first (teasers/digests
  read "latest" off it); `orderRoots` in `CommentList.tsx` re-sorts at
  render: pins first (earliest pin first), then newest-first — EXCEPT
  comments that arrived after the list mounted, which stay above the pins
  until reload (Ed: otherwise a just-posted comment looks like it
  disappeared). `pinnedAt` is selected on thread ROOTS only (commentTree
  budget).
- **digest click-to-read** — `digest_sends` table + `stampDigestLinks`
  (api `email.ts`) + `DigestReadMarker` (app layout): every digest link
  carries `dg=<send id>`; one click marks that email's shown comment
  threads seen up to its send time (`markDigestRead`, GREATEST semantics).
- **topic-draft-recovery** — `useStoredDraft` in
  `apps/web/src/lib/formDrafts.ts` + `DraftRestoredNotice` (Ed,
  2026-08-21, after losing a long topic draft to an accidental navigation
  + browser Back): the topic composers keep their fields in
  **sessionStorage**, so the writing survives leaving the page, Back, and
  a reload — and is dropped when the tab closes, so nothing lingers for
  the next person on that machine. Distinct from
  [[comment-draft-store]], which is a module-level map: that dies with
  the JS context, which is fine for a one-line comment and not for a
  topic. `initial` is the baseline (empty for a new topic, the saved
  content when editing), so an untouched form stores nothing and typing
  back to the original clears it; restore happens in an effect AFTER
  mount (restoring during render would be a hydration mismatch) and only
  while the form is still untouched. Keys: `new-topic:<slug>` (one draft
  per forum) and `topic:<id>`. Create/save/Cancel all discard.
- **queue-back** — the Topic Queue's left arrow (Ed, 2026-08-21):
  `?back=n` on `/queue` shows the topic n steps behind the live one, so
  the step is a URL, ordinary navigation, and the browser's own Back
  works. **Going back never makes anything unseen** (Ed's rule): it is a
  pure read, `remaining` and the "n of N this round" counter don't move,
  and the ❤️ switch still saves — you revisit a decision rather than
  rewinding the queue. The history is `historyIds` from `getTopicQueue`:
  this round's reviewed topics sorted by the SAME comparator as
  `remaining`, which is what makes it the order they were shown —
  ordering by `seenAt` would reshuffle the history the moment you re-❤️ an
  older topic, since hearting bumps the seen mark. The right arrow mirrors
  it (one step forward, landing on the live topic at step 0), where at
  step 0 it stays the Next that marks seen and advances. The done screen
  carries the same step as "Look back at the last topic".
- **queue-keys** — the Topic Queue's arrow mapping (2026-09-07): **←**
  back, **→** next, **↑** ❤️, **↓** comment. `queueKeyAction` /
  `isTypingTarget` in `apps/web/src/lib/queueKeys.ts` decide (pure, so the
  mapping is unit-tested); `QueueControls` binds ONE window listener per
  mount and dispatches through a ref, because `router.refresh()`
  reconciles that component in place — a listener closed over `topicId`
  would keep acting on the topic two cards back. Each arrow does exactly
  what its button does, queue-back included, so nothing new can be done
  from the keyboard. ↓ runs `requestOpen()` and focuses
  `[data-topic-composer]` (bounded rAF retry: `followCommentsOpen` may
  still be switching the strip back to Comments); in the box **Enter
  posts**, Shift+Enter starts a line, Escape blurs and the arrows come
  back — `CommentComposer`'s `submitOnEnter`, which the queue is the only
  surface to pass; a successful Enter-post blurs the box too, so ↓ type
  Enter → is one uninterrupted gesture (adopted from Matt's #346,
  2026-09-10). Arrows are ignored with any modifier and while the
  target is an input/textarea/contenteditable; ↑/↓ `preventDefault` so the
  page doesn't scroll under the card, which is the one thing this costs.
  Covered by `QueueControls.test.tsx` — the web workspace's first jsdom
  component test.
- **submit-shortcut** — `apps/web/src/lib/submitShortcut.ts` (#361,
  King-Mob; 2026-10-02): **Ctrl+Enter / ⌘+Enter** presses a composer's
  send button, Gmail/GitHub-style. `isSubmitShortcut` (pure; never Shift/
  Alt, never mid-IME) + `submitFormFrom` (`requestSubmit` on the form's
  ONE enabled submit button — same handler, same empty check, nothing
  while `busy` disables it, nothing if the form has several submits).
  Wired once in `GrowingTextarea`, so every plain-text comment composer
  has it (top-composer, chain-tail incl. the Lounge foot box, Reply box,
  inline edit, slot chat); `MentionTextarea` lets it through with the
  picker open (closes the list, posts the text as typed — no
  auto-complete); `RichTextEditor`'s opt-in `submitOnShortcut` (topic
  create/edit, Lounge opening post start/edit) outranks TipTap's
  Mod-Enter hard break. Plain Enter is unchanged (queue-keys'
  `submitOnEnter` still posts on it). Send buttons carry
  `aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}`. A new composer gets it by
  using `GrowingTextarea` in a form with one submit button.
- **page-topic-toc** — `PageTopicToc.tsx` (Ed, 2026-08-17): the little
  table of contents under the My Topics and ❤️/💙 Topics page titles —
  the People-page profile-card topic-list look (`person-topics` styles),
  bare on the page background, hidden below 2 topics. My Topics links
  jump to the anchored cards below (`#topic-<id>` on `TopicManager`'s
  root `li`, scroll-margin clears the topbar) in the current sort order,
  with a `.toc-jump-slack` spacer after the list so even the LAST card's
  jump can land its heading at the viewport top (Ed, 2026-08-17);
  the ❤️/💙 pages link to permalinks (their feed paginates, so the card
  may not be rendered) via the slim `HEARTED_TOC_QUERY` full list.

- **member-deactivation** — `deactivateMembership` / `reactivateMembership`
  in `packages/core/src/members.ts` + `timetableMemberships.deactivatedAt`
  (migration 0042) + `POST /api/memberships/:id/{deactivate,reactivate}`
  + the Deactivate/Reactivate controls in `PersonAdminPanel` (Ed,
  2026-09-10): the reversible alternative to "Remove from forum" for
  someone who has left. The membership ROW STAYS — it is what gives their
  comments a byline and their topics a host profile, which is exactly what
  removal destroys. While the stamp is set: `getViewerRoles` resolves the
  roles as NONE (a suspension — non-member for every permission check,
  private forums unreadable, the forum gone from their switcher; the
  stored `roles` are untouched so reactivation restores them), the person
  is off the People page and the host picker (admins see them in a dimmed
  **"Deactivated"** section at the foot of People, with Reactivate; their
  person page is admin-only), their live topics were unpublished through
  the ordinary `unpublishTopic` path (one `topic.unpublish` log line each,
  under the admin, plus a `member.deactivate` line carrying the count),
  and `membershipIsEmailable` says no so their email digests pause (in-app
  notifications untouched — Ed narrowed it to email). Reactivation
  republishes NOTHING (editorial call; Publish exists) and stamps
  `lastDigestAt` to now so the first digest back doesn't replay the
  absence. Owner and self can't be deactivated. Not to be confused with
  the FORUM privacy value `deactivated` (whole-forum, admins only).
  **Their ❤️s and 💙s stop counting anywhere while deactivated** (Ed,
  2026-09-11): they are off the Analysis tables and header counts
  (`loadMembers`), out of the Analysis 💬 metrics, and their hearts are
  hidden through [[active-member-filter]] — rankings, card counts,
  breakdowns, export, calendar hearted audiences, host-digest ❤️ news.
  Comments stay visible in threads with their byline, and the card's 💬
  count still counts them.

- **active-member-filter** — `givenByActiveMember(userIdCol,
  timetableIdCol)` in `packages/core/src/activeMember.ts` (Ed,
  2026-09-11): the WHERE condition every ❤️/💙 reader carries so a
  deactivated member's hearts are hidden at read time (nothing is
  written, so reactivation restores them). A correlated `NOT EXISTS`
  against a membership with `deactivatedAt` set — NOT a join, so a heart
  from someone REMOVED from the forum (no row) keeps counting as it
  always has. Readers that already left-join the GIVER's membership use
  `isNull(timetableMemberships.deactivatedAt)` directly (`digests.ts`,
  `listTopicHostHearters`). Any new query that counts or lists hearts
  must carry one or the other.

- **comment-draft-store** — `useDraft`/`draftKey`/`hasDraft`/`clearDraft`
  in `apps/web/src/lib/commentDrafts.ts` (Ed, 2026-08-21): half-written
  comments live in a module-level map keyed by what's being written, not
  in component state, so nothing that destroys a composer can take the
  text with it. VERIFIED on dev 2026-08-21 to survive a route change (type
  a comment, go to Calendar, come back). NOT the mechanism originally
  written here: topic-tabs does not unmount panes on switching — see the
  topic-tabs entry — so plain tab switching is not what loses a draft; the
  live candidates are route changes, the comment-teaser folding a tree,
  and any card remount. Every composer uses it — top-composer,
  chain-tail-composer, the Reply box, both inline editors, and the slot
  chat. Composers that open from a button (Reply, Edit) reopen themselves
  when `hasDraft` says text is waiting, since the draft outlives the
  unmount but the open/closed state doesn't; posting, saving, or
  explicitly collapsing clears the draft, and a page reload is a clean
  slate. Any new composer should use it rather than `useState("")`.

- **vanity-address** — `packages/shared/src/vanityAddress.ts` +
  `vanityRedirect` in `apps/web/src/proxy.ts` + `forumRoutesByHost` (Ed,
  2026-09-04): a forum's short public address — `topic.newspeak.house/2026`
  — stored in `timetables.customDomain` as `host` or `host/prefix`.
  Requests on ANY host that isn't ours are REDIRECTED (307) to the origin:
  into the forum whose host + longest path prefix matches, rest of the path
  and query carried along, or to the home page when nothing matches. Never
  served in place (sessions are per host, links are absolute `/f/<slug>/…`,
  emails link home) — Ed chose the redirect over white-labelling. Several
  forums share a host by prefix (one per year). Runs FIRST in `proxy()`,
  before Clerk. Each hostname needs the DO app spec line + a CNAME once
  (`docs/DEPLOYMENT.md`); paths need nothing. The settings field is
  "Vanity address"; the column and GraphQL arg keep the `customDomain`
  name.

- **sent-back-notice** — how a host hears that an admin pressed
  `BackToDraftingButton` (`AdminTopicActions.tsx`, #344) on their ready
  draft (Ed, 2026-09-08). Both channels read the `topic.unready` activity
  event the mutation already logged, excluding the host's own flips
  (their ReadySwitch writes the same event): `listSentBackNotifications`
  in `packages/core/src/notifications.ts` puts a "moved your topic back to
  drafting" line in the notifications pane (and the unread badge), linking
  to the My Topics card with the drafting tab open; `unreadyActivities`
  in `digests.ts` rides the digest as the `unready` activity kind — a
  switch-less admin override like `assignment`, "Sent back to drafting"
  pill, counts as news, skipped once the topic is no longer a draft. No
  reason travels with it: the drafting thread is the channel for that.

- **my-topics-heart-row** — `TopicActionsRow` leading the My Topics
  Comments tab (`heartRow` in `MyTopicsTabs.tsx`; Ed, 2026-09-25), where
  ❤️ leads the feed card's. Published topics get the full feed row.
  Unpublished/archived get its `dormant` mode — count only, "paused while
  …", no 💬, names-only `DormantBreakdownBody` — and their Comments tab
  always shows to carry it. Drafts get none. **Dormant ❤️s**: unpublishing
  keeps the heart rows but every weight/count reader counts published
  topics only, so a retired topic's ❤️s count nowhere until republished;
  only its host and admins may see them (`topicDormantHearters`, gated by
  `canEditTopic` — never widen the public `topicWeightedBreakdown`).
- **managed-heart-fields** — `ManagedTopic.heartCount` /
  `viewerHasHearted`, batched in `hostDashboard` via
  `loadTopicHeartSummaries` (core `topics.ts`): the feed's rows (cutoff +
  [[active-member-filter]]) minus the published-only condition, so a
  live topic matches the feed and a retired one shows its dormant ❤️s.

- **last-activity-signals** — `loadLastActivitySignals` in
  `packages/core/src/lastActivity.ts` (Ed, 2026-09-25: "any sign we have
  that they're active"): the "Last activity" date in BOTH Analysis
  activity tables (Faculty + Elector) is the newest trace of any kind —
  activity log (as actor), the ❤️/💙 LEDGER `heart_events` (never the
  `hearts` table, whose `createdAt` a cutoff revival bumps), comments and
  slot chat in any thread (posted/edited), availability + patterns,
  pencils they created, and READING (queue `topic_seen`, `comment_seen`,
  All Topics + notifications visits). Unwindowed by the hearts cutoff (the
  count columns and Active/Quiet filter keep the window). Shown to hosts
  too, so it reveals colleagues' 💙 and "last seen" timing — Ed's
  informed call after learning hosts can see the tables. View-as can't
  pollute it (all reading marks are mutations, refused while previewing);
  keep any NEW reading mark a mutation for that reason.

- **contact-details** — `timetableMemberships.contactDetails` (migration
  0043) + shared `canSeeContactDetails` / `isProfilePublic` +
  `ContactDetails.tsx` (Ed, 2026-09-30, from users on public forums
  wanting somewhere to put contact details the internet can't read): a
  second per-forum Markdown profile box that ONLY forum members see —
  never the public, never deactivated members, never the JSON export.
  Stripped in `personForViewer` (members.ts), the one gate every
  profile read passes; the export builds its people field by field and
  deliberately omits it (Ed: nobody collects everyone's contact details
  in one download). Readers see it ABOVE the bio (person page, host header on
  /topics, People cards); both editors (own profile page, admin Edit on
  People cards) are one "Profile" over Name → Contact Details → About
  (Ed, 2026-09-30, second pass — the first pass's separate "Public
  Profile" heading is gone: a public-sounding title over a members-only
  box contradicted itself). Named "Contact Details",
  not "Private Profile", so people don't write a second whole profile.
  Contact Details and About each carry a who-can-read-this line
  (`lib/profileLabels.ts`; About names the internet only where
  `isProfilePublic` — public/no_comments; hosts and admins on
  hosts_only); readers see a
  🔒 "Members only" note on Contact Details only where the profile around
  them is public.

- **host-lounge** — the {host} Lounge (Ed, 2026-09-30;
  `docs/host-lounge-plan.md`): ONE hosts-and-admins-only threaded room per
  forum at `/f/[slug]/lounge` ("Faculty Lounge" on Newspeak), OFF until
  an admin switches it on in Forum Settings. Its own tables
  (`lounge_comments`, migration 0044), so nothing that reads topic
  comments can see it — never fold it into `comments`. Gate: shared
  `canUseLounge` + `isLoungeEnabled`; anyone else gets `lounge: null`
  and the page 404s, so the room never announces itself. Conversations
  are an opening post (Markdown, the topic editor, draft recovery) plus
  plain-text replies threaded by the ordinary comment components through
  **comment-thread-adapter**. **Bump order** (latest reply first, pins
  above — admins pin), but **nothing moves while you read**:
  `stableOrder` in `lib/loungeThread.ts` keeps the order the page first
  showed, fresh conversations go on top, "Show older" appends below.
  Edits, reacts and moderation never bump. **The quiet thread** (Ed's
  option A with the nesting kept, 2026-10-02 — Lounge ONLY, through the
  adapter's `variant: "quiet"` + `footComposer`): no bubbles or role
  pills (role and time as muted text, "Faculty · 9h"), ONE action row
  (reacts · Reply · ⋯ menu with Edit/Delete/Hide/Pin) that floats as a
  hover/focus toolbar on replies on hover devices, replies nested as
  before under an "n replies" head, and NO chain-tail composers — one
  "Reply…" foot box per conversation answers the opening post, Reply on
  a reply opens its inline box, `?reply=` lands on the one or the other.
  A muted "{hosts} and {admins} only" line sits under the title; the
  "+ New conversation" pill sits beside the heading on desktop and the
  round "+" floats bottom-right under 640px, where the composer becomes a
  full-screen sheet. Emoji reacts (the first in Topic)
  via Frimousse with same-origin data in `public/emojibase` (the CSP
  blocks its CDN); ❤️/💙 refused — they are votes here. Digest: ONE card,
  always LAST, never in the subject line (`loadLoungeDigestCard`: new
  conversations, replies in ones you started or chains you're in,
  @mentions — the rest stays in the room); reacts never digest. Nav: a
  dot, not a count. Replies/mentions reach the notifications pane. Counts
  as Last activity; excluded from the JSON export.

- **editor-image-upload** — `ImageControl` in `RichTextEditor.tsx` +
  `lib/uploadImage.ts` (Ed, 2026-09-30): where the editor gets
  `uploadForum` (topic create/edit, the Lounge) its image button, paste
  and drag-and-drop upload through the same signed-PUT path as covers
  (purpose `post-image`, hosts and admins), after `shrinkImage` re-encodes
  anything over 1600px or 1.5 MB to WebP (GIFs untouched). Without it
  (profile bios, which electors edit) the button still asks for an image
  URL. Uploads are PUBLIC-READ at an unguessable address — never private,
  Lounge included, and the Lounge composer says so. Paste: a clipboard
  carrying image files uploads them (`imageFiles` decides; `handlePaste`
  claims the event), anything else falls through to #359's plain-text
  `clipboardTextParser`.

- **comment-thread-adapter** — `lib/commentThreadAdapter.tsx`
  (2026-09-30): the context CommentList, CommentActions, CommentEditForm
  and ChainTailComposer read their mutations (and optional body / editor
  / footer render hooks) from. Topic comments are the default; the
  Lounge provides its own. One thread implementation for both surfaces —
  add a new comment surface the same way, never by copying CommentList
  (SlotDiscussion's copy is the cautionary tale). Presentation options
  (2026-10-02, only the Lounge sets them): `variant: "quiet"` swaps the
  bubbles + action words for the quiet thread (`QuietCommentItem` /
  `QuietActions`; topic threads take `BubbleCommentItem` /
  `ActionWords`, unchanged); `footComposer: true` drops every chain-tail
  composer for ONE foot box at the root (`ChainTailComposer foot`, same
  draft key and deep links) and opens a reply's inline box on its
  `?reply=`; `renderFooter(comment, part)` gets `"chips"` / `"add"` in
  the quiet variant; `mentionRoles` limits the @ picker.

- **feed-position-store** — `lib/feedPosition.ts` (Ed's "going back feels
  fragile", 2026-08-28): remembers, per feed view, how many pages the
  infinite feed had appended and the scroll offset, so Back replays them
  instead of dropping you at the top. `InfiniteFeed` refetches that many
  pages on mount and scrolls in an effect that waits for the commit —
  before the cards are in the DOM there is nothing to scroll to. Keyed by
  the element `key`'s view identity (sort, host, ❤️/💙 filter, seed,
  search) PLUS the forum slug, since the person page's key lacks it.
  Module-level like [[comment-draft-store]], deliberately: a within-visit
  convenience that dies with the JS context. **Only a history traversal
  restores** — popstate arms it, any click disarms it (a click-initiated
  navigation is not a traversal), so clicking through to a feed you were
  once deep in still starts at the top. The browser's own clamped restore
  still runs first, so a deep restore briefly shows the top and then
  jumps; fixing that would mean owning `scrollRestoration` app-wide.

## Gotchas (learned the hard way)

- **In-page jump links must be `next/link`, never a bare `<a href="#…">`**
  (2026-08-28). A fragment link is navigated by the BROWSER, so its history
  entry carries `history.state === null`, and Next's popstate handler opens
  with `if (!event.state) return` — it ignores entries it did not create.
  Pressing Back onto one is a NO-OP: the URL changes and the previous page
  stays rendered, and the next Back skips past it. The bug is silent, shows
  up one navigation later, and the two spellings look identical in review.
  `Link` has an `onlyHashChange` path that scrolls to the fragment and
  pushes a router-owned entry. Verified on dev; cost the People page's
  table of contents (`#person-…`, `#people-<role>`).

- **`router.refresh()` is bound to the URL, not the entity** (2026-09-03).
  `useGqlAction` ends every mutation with a refresh of the CURRENT route.
  A draft topic's slug follows its title until publish, so a rename from
  the topic's own permalink moves the page underfoot and the refresh
  404s. `TopicEditForm` compares old and new `topicPath` and
  `router.replace`s instead when they differ and you're standing on the
  old one; `refresh` accepts a function of the result for exactly this.
  Any future mutation that can change the current page's address needs
  the same treatment.
- Postgres `ALTER TYPE … ADD VALUE` can't run inside a transaction — Drizzle
  migrations must **recreate the enum** instead (see migrations 0013/0014).
- "Draft" means THREE things — never blanket-delete or rename "draft"
  matches. (1) The old draft **topic status is removed** from the enum (dead
  references may lurk). (2) The "**drafting thread**" — `admin_only` comment
  visibility — is a live feature. (3) Since 2026-08-21 **"draft" is the
  user-facing label for the stored `submitted` status** (Ed: nothing is
  submitted and nothing is reviewed — a topic is created straight into it
  and sits there while its host writes; the real "ready" signal is the
  separate `readyAt` switch, which is why the Pending queue always said
  "still drafting"). The label lives in
  `apps/web/src/lib/topicStatusLabels.ts`; the stored value stays
  `submitted` everywhere — DB enum, GraphQL, identifiers, CSS
  `.status-submitted` — because renaming a live enum value is a
  non-additive migration (R11) and copy-only follows the rebrand pattern.
- `apps/web/.next/` build output pollutes searches — scope greps to `src/`.
- Seed fixture bodies in `dev-sample-data.md` must not contain `^## ` lines
  (breaks the section parser); `###` is safe.
- React 19 re-applies `dangerouslySetInnerHTML` on the first post-hydration
  update even when `__html` is unchanged, recreating the children. Any DOM
  patched inside such a container (see `CollapsibleTopicBody`) must be
  re-applied in an every-commit layout effect, not keyed on props.
- In production the API refuses to boot when `SPACES_BUCKET` is set without
  `SPACES_KEY`/`SPACES_SECRET` (outside production it warns and 503s
  uploads) — keep app specs and workflow env in sync.
- Modules bundled into Next's `opengraph-image` routes (`lib/ogCard.tsx` and
  anything it imports) must NOT import `@timetable/*` workspace packages —
  the OG routes' separate compilation can't resolve them (typecheck passes;
  the dev server then fails at request time and e2e times out). Keep those
  modules dependency-free; duplicate small constants locally with a comment.
- **DigitalOcean App Platform sits behind Cloudflare** — every
  `*.ondigitalocean.app` response carries `CF-RAY`/`Server: cloudflare`, on
  `topic.forum` too. So `X-Forwarded-For` reads `<real client>, <cloudflare
  edge>` and Express (which counts trusted hops from the RIGHT) needs
  `TRUST_PROXY_HOPS=2`. At 1 it resolved `req.ip` to the Cloudflare edge,
  which rotates per request — the rate limiter scattered every caller across
  a pool of buckets and limited nobody, while still able to 429 innocent
  users off those shared buckets. Anything keyed by client IP must assume
  this topology (measured 2026-08-21, `docs/OPERATIONS.md` R1).
- **SSR arrives from ONE address.** The web app fetches the API over the
  public URL (`NEXT_PUBLIC_GRAPHQL_URL` = `${APP_URL}/graphql`), so every
  server-rendered page view reaches the API from the web container's egress
  IP and shares a single rate-limit bucket. Hence `RATE_LIMIT_MAX=6000` in
  the hosted specs; per-user write budgets (`http/action-limits.ts`) are the
  real abuse protection.
- Drizzle raw `sql` templates with Date params (`` sql`${col} >= ${now}` ``)
  bypass the column's Date mapping and THROW at runtime on hosted Postgres
  while passing every local check — always use `gte`/`lte`/`eq` operators
  for date comparisons (calendar-v2 dev outage, 2026-07-31).

## How this project is run (Ed's dev-ops conventions)

- Agents also follow Ed's shared instructions in edsaperia/dev-ops: `AGENTS.md`, `CONVENTIONS.md` (builders, coordinators, pull requests) and `claude/QUESTIONS-PAGE.md` (Ed's questions page, where every ask of Ed goes). Read them from dev-ops `main`; a session whose GitHub tool cannot reach edsaperia clones dev-ops (public) instead. This file wins where the two disagree.
- **Merging is Ed's decision, on his page**, and the coordinator does the merge. Merging to `main` deploys **dev** only. **Production is never deployed by an agent**: when a release is ready, the coordinator asks Ed, and Ed runs `deploy-production.yml` himself (see Git & deploy workflow above).
- **Other people's PRs** (contributors other than Ed's builders) are theirs: the coordinator reviews and asks Ed, and never pushes to or merges them unasked.
- `.claude/skills/page-contract/` (checks writes to Ed's page) is copied from dev-ops; refresh it from there. `.claude/settings.json` carries the shared standing permissions on top of this project's own, and `defaultMode: "auto"`.
