# 2026-08-17 — docs catch-up before the prod deploy

An audit compared PRODUCT.md, ARCHITECTURE.md, CLAUDE.md, and .env.example
against the code; this pass fixes every verified drift. No behaviour
changes — documentation only.

## The recurring themes

Most items were features that shipped after the docs were last touched:

- **Topic Queue is for every member** (v2, 2026-07-29 — `canUseQueue`),
  not electors only: electors decide with 🔁/❤️, other members read
  through. Fixed in both PRODUCT and ARCHITECTURE.
- **The availability-privacy decision (2026-08-16)** replaced the "open
  question" framing: the wash is host/admin-only everywhere, charted on
  the topic's hearters on the sessions tab; electors see only their own
  🟢🟡🔴. `topicSessions` docs updated to match `slots.ts`.
- **Ready to publish (2026-08-06)** — `setTopicReady`, `topics.readyAt`,
  the Pending page's ready filter, and the ready-only sidebar badge —
  was entirely undocumented.
- **Feed search** (search box, highlighted matches, "No topics match")
  and the two newest sorts (📚 Latest Created / ✏️ Latest Updated) joined
  the feed descriptions; `topicFeed`'s `q` / `heartedBy` /
  `hostHeartedByMe` args joined the query list.
- **The per-forum API page** (export download, personal tokens with the
  scope ceiling, GraphQL docs, Atom + ICS) got a PRODUCT subsection and
  an ARCHITECTURE bullet; the export row now says role-filtered
  everything-you-can-read, calendar included.

## Smaller corrections

REST table gained `PATCH /api/memberships/:id/email` and
`POST /api/forums/:idOrSlug/digest-test`. The GraphQL field is
`forumRouteByDomain` (`timetableRouteByDomain` is only the web proxy's
alias). The workbench and sessions tab render `CalendarTable` — the one
row implementation since 2026-08-16 — not the retired parallel pieces,
and the workbench's Show past moved into the controls row (`pastToggle`
is calendar-page-only now). Notifications also cover @mentions and
session pencilled/confirmed/cleared. The activity feed known gap is gone
(LiveLogSync polls every 20s). The SPACES_BUCKET boot refusal is
production-only. `.env.example`: `E2E_TEST_MODE` checks `"1"`, the
environments pointer is docs/DEPLOYMENT.md, production is topic.forum,
and the Playwright knobs are listed.
