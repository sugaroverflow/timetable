# Topic-workbench: per-topic scheduling on My Topics

**Date:** 2026-08-14
**Trigger:** step two of the demand-first scheduling direction (see
`2026-08-14-open-slot-comments.md` for step one and the design context).
Hosts should schedule facing demand ("which dates suit the people who ❤️'d
this topic?") rather than supply (a calendar grid of empty slots). Additive:
the calendar page is untouched; trimming it is a later, deliberate step.

## Changes

- **`topicSlotFit(idOrSlug, topicId)`** (`apps/api/src/graphql/slots.ts`):
  new slim lazy query → `TopicSchedule { hearterCount, slots: TopicSlotFit[] }`
  where each row is `{ slotId, startsAt, endsAt, locations, freeLocations,
  full, topicStatus, counts }`. Resolver reuses the calendar's audience-lens
  math (`getAudienceElectorIds({kind:"hearted_topic"})` + `buildCalendar`)
  and discards `perUser` at the boundary — the panel's counts are exactly
  the calendar page's and the claim snapshots'. Null-for-unauthorized
  (`topicWeightedBreakdown` precedent): signed-in → readable forum →
  calendar enabled → topic in forum → owner-or-admin.
  - Why not reuse `calendar(audience:…)` client-side: hosts pass the host
    gate, so it would serialize full per-elector arrays for every slot; and
    the HostDashboard document (3 comment trees per topic) has no cost
    headroom — the workbench fetches its own ~14-field document lazily via
    `clientGql` on panel expand.
- **`TopicSchedulePanel.tsx`** (part name: **topic-workbench**): collapsible
  `host-panel` sibling between AdminCommentsPanel and ManageControls on
  TopicManager cards; body mounts and fetches on first open
  (BreakdownPanelBody idiom). House sortable table (`useTableSort` +
  `SortHeader`): Date · Time · Where (free locations) · 🟢 · 🟡 · 🔴 ·
  action; default sort date-ascending, count columns first-click descending
  (the **best-dates table** — sortable columns instead of one blessed
  ranking, per the no-baked-in-aggregation principle). Per-row pencil-in
  posts the existing `addSlotSession` mutation (single free location
  preselected; select when several; location-free forums post null); rows
  already booked for the topic show the pencilled/confirmed pill; full rows
  render muted. `canPencil=false` (confirmPolicy "admins") hides the action
  column — demand stays visible.
- **`TopicManager.tsx` / `my-topics/page.tsx`**: `calendarEnabled` +
  `canPencilSessions` props; panel mounts on published cards only. The
  HostDashboard query is unchanged.
- `CalendarTable.tsx`: `formatDate`/`formatTime` exported for reuse (en-GB
  pinned).
- Docs: PRODUCT.md demand-first paragraph (also fixed the stale "at most one
  session" line — bookings are zero-to-many per slot since 2026-08-06),
  ARCHITECTURE.md, CLAUDE.md glossary.

## Tests

`app.integration.test.ts`: mapping fixture (freeLocations / full incl. the
location-free "" case / topicStatus from the topic's own booking); admin
non-owner gets data, other hosts null; anonymous / calendar-disabled /
foreign-topic all null without touching `buildCalendar`.

## Notes

- perUser is never exposed by `TopicSlotFit` — electors' group availability
  remains host-gated elsewhere and absent here.
- Deferred by design: calendar-page trimming ("build the workbench first,
  then remove things so we don't forget anything important" — Ed), homes for
  office hours / admin custom sessions, stances/petitions (parked design),
  space-provenance.
