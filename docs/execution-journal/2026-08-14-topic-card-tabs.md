# Topic-card tabs + workbench month/week grouping

**Date:** 2026-08-14
**Trigger:** Ed's round-3 feedback on the demand-first work: (1) the My
Topics card's stacked sections should be horizontal tabs, (2) the
workbench should regain the calendar's week groupings / month headings /
no-past-dates.

## Changes

- **topic-card-tabs** (`TopicCardTabs.tsx`, new): public comments /
  {host}-only / drafting thread / Scheduling as a Base UI `Tabs` strip
  (`.card-tabs` CSS) replacing the successive collapsibles on TopicManager
  cards. Default tab = Comments (mirrors the old always-open public
  thread). Tab presence follows the old mount rules: {host}-only only with
  content or 💙s, Scheduling only when calendar on + published. Inactive
  panels stay unmounted (Base UI default) so the workbench's lazy fetch
  fires on first tab open, and count badges ride the labels
  (`Comments (12)`, `Faculty-only (2) · 💙 3`).
- Body extraction so tabs and collapsibles share flesh:
  `HostOnlyThreadBody` out of `HostOnlyPanel` and `AdminCommentsBody` out
  of `AdminCommentsPanel` — the collapsible wrappers survive unchanged at
  their other call sites (feed TopicCard, permalink page, ModerationCard).
  `TopicSchedulePanel.tsx` lost its own Collapsible wrapper entirely
  (TopicManager was its only consumer); it now exports `TopicScheduleBody`.
- **Workbench grouping**: in the By-date view, rows group under
  `cal-month-row` month headings with `cal-week-start` gaps — the calendar
  page's exact idiom (`monthLabel`/`weekKey` now exported from
  `CalendarTable`). Since headings carry the year, the per-row year shows
  only in the flat By-availability view. Past slots were already excluded
  server-side (`buildCalendar` defaults `includePast: false`) — no change
  needed, noted for the record.

## Notes

- TopicManager's complexity dropped well under the lint budget again; the
  tabs component itself splits into `CardTabList` + `PublicCommentsPane`
  for the same reason.
- No API changes, no schema changes.
