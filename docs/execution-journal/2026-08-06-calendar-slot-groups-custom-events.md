# 2026-08-06 — Calendar: multi-location grouping + admin custom events

Two calendar features from Ed:

## Open same-time slots group into one row

An open timeslot offered in three rooms is one question — "can you do
Tuesday 7pm?" — not three rows. `groupCalendarRows`
(`apps/web/src/lib/calendarGrouping.ts`, unit-tested) collapses OPEN
slots sharing start+end into one row; slots carrying a session stay solo
(sessions are per-slot by design). Client-side only — the GraphQL shape
stays per-slot.

- The row line shows the distinct locations comma-separated.
- The pencil-in control gains a **location dropdown** (only when
  grouped) choosing which member slot receives the session.
- The elector's 🟢🟡🔴 toggle **broadcasts** to every member (aliased
  setAvailability calls in one mutation) — the answer is about the time,
  so members converge.
- Washes/avatars/discussion come from the **representative slot** (first
  by location sort). Known edge: pre-grouping comments on a
  non-representative member aren't reachable from the grouped fold.
- Admin slot controls render per member, labelled with the location.

## Admins fill any slot with a custom title + link

`timeslots.custom_title` (additive migration 0030). A custom session has
topicId and sessionHostId both null — no owner for the never-displace
rule to see — so setting, displacing, or clearing one is gated on
`canManageCalendar` instead (`assertMayDisplace`). Flow stays pencil →
confirm: admins pick "Custom event…" in the pencil-in select, type a
title (+ optional link), and confirm as usual; Confirm/Save URL re-send
the title so it doesn't read as "clear".

- ICS summary: topic title → custom title → office hours → "Open slot"
  (integration-tested).
- Activity log: pencil/confirm/clear carry `title` in the payload.
- Not done (noted): custom sessions don't appear in digests
  (`listUpcomingSessions` inner-joins topics) or the topic-joined
  notifications feed — both would need their queries widened.
