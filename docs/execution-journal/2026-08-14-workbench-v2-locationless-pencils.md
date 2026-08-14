# Workbench v2: location-less pencils, washed rows, sort toggle

**Date:** 2026-08-14
**Trigger:** Ed's round-2 feedback on the topic-workbench (same day it
shipped): rows should be datetimes, not (datetime, location) — "I don't
think we are managing location availability anymore; we can have multiple
pencils on one timeslot." A pencil is the **host** saying "I am available
at this time"; when/where/who gets discussed on the calendar page (whose
own redesign is deferred).

## Model change (migration 0037)

- Dropped `slot_sessions_slot_location_uq` (the location-contention model,
  2026-08-06/08-11). New uniques: `(slot_id, topic_id)` — one pencil per
  topic per slot — and partial `(slot_id, session_host_id) WHERE topic_id
  IS NULL` — one office-hours pencil per host per slot (partial because
  topic sessions also carry `session_host_id`; a host may pencil several
  of their topics into one slot). Plus a plain `slot_id` index. The
  migration dedupes rows the old model legally allowed (same topic at two
  locations in one slot), keeping confirmed-first-then-earliest.
- `location` stays as a column — display copy and a future confirm-time
  assignment — but never contends. Core `slotLocationTaken` →
  `slotSubjectTaken` (pre-flight for the friendly "Already pencilled in"
  error; the uniques backstop races).
- API `addSlotSession`: location optional, no offered-location check;
  `proposeSlot` likewise no longer requires a location in
  configured-location forums.

## Workbench v2 (`TopicSchedulePanel.tsx`)

- The sortable table is gone. Rows are the calendar's row-wash idiom: one
  washed row per datetime (the tint IS the availability chart over this
  topic's hearters), expandable to the hearter avatar fold — `TintLayer`,
  `FoldAvatars`, `tallyStates` extracted from `CalendarTable.tsx` into
  shared **`CalendarRowWash.tsx`** unchanged.
- Sorting collapsed to a two-state `avseg` toggle (new neutral
  `.avseg button.on` style): **By date** / **By availability**, the latter
  ordered 🟢-dominates-🟡 (lexicographic; since every hearter is exactly
  one state, green+yellow is the complete ordering — date breaks ties).
- Per row: pencil (no location asked) / unpencil (own proposed via
  `clearSlotSession`) / status pill when confirmed. No comments — it's a
  dashboard; `topicSlotFit` reshaped to `{slotId, startsAt, endsAt,
  sessionId, topicStatus, counts, perUser}` (perUser now included — the
  viewer is the topic's host or an admin, exactly who may see it;
  `freeLocations`/`full` dropped).

## Deferred

- Calendar-page implications of location-less pencils (multiple pencils
  per row, the role of the location filter/selects, confirm-time location
  assignment — Q53) — next design conversation.
- Calendar-page trimming (still pending from round 1).

## Tests

Integration: topicSlotFit v2 mapping (own sessionId/status, perUser);
addSlotSession pencils location-less even on configured-location slots and
refuses duplicate topic pencils (`slotSubjectTaken`).
