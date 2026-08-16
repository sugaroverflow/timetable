# 2026-08-16 — the export learns the calendar, the API page catches up

Closes the "export excludes timeslot data" known gap (PRODUCT.md), on
Ed's call while reviewing the API page for the prod push.

## `calendar` in the data export

`buildDataExport` gains a `calendar: { slots }` key when the forum's
calendar is enabled, built from the same machinery the calendar page
uses (`buildCalendar`, past included — the export is an archive) and
filtered by the same role rules:

- everyone gets each slot's window, offered locations, and sessions
  (pencilled/confirmed topics, office hours, custom events);
- signed-in members add their own 🟢🟡🔴 answer and each slot's
  discussion (`listSlotComments`; admins include hidden messages, claim
  comments carry their frozen snapshot);
- hosts/admins add the elector availability tallies and per-elector
  states — the export equivalent of the wash and the avatar fold.

The audience is the forum's electorate (`{kind: "all"}`) and only
computed for viewers who receive the tallies. `buildDataExport`'s
timetable param now includes `settings` (the REST route already passes
the whole row).

## API page

The export paragraph documents the calendar section, and the page gains
the section it was missing: the ICS feed
(`/api/forums/:slug/calendar.ics`) — public forums unauthenticated,
private forums via the calendar page's "Subscribe (ICS)" button, whose
URL carries the member's personal feed token. Everything else on the
page was audited against the code today and found accurate (token scope
ceiling, REST-refuses-tokens, Atom feed, export contents).
