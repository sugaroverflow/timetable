# 2026-08-11 — Slots gain offered locations

Ed's requirement from Newspeak House scheduling reality: the classroom is
available often, the hall rarely — releasing hall dates is meaningful
information, and "when is the hall free?" must be answerable. Slots stay
pure time windows (the 2026-08-06 bookings split holds — availability and
discussion attach to the time), but each slot now carries the set of
locations on offer at that time, chosen at creation.

Design rules (Ed's spec): every slot has ≥1 location when the forum has
locations configured; hosts pencilling must pick one of the slot's
locations; the location filter matches slots that OFFER the location (open
ones = exactly when it's free); same-time slot creation AGGREGATES
(locations union into the existing slot); exact (time, location)
duplicates are no-ops. Forums with no configured locations keep the old
location-free behaviour throughout.

- **DB**: `timeslots.locations text[] NOT NULL DEFAULT '{}'` (migration
  0033), backfilled from each slot's bookings' locations.
- **Shared**: `planSlotCreation` — pure planner for create-time matching
  (exact window, then the same-cell-within-24h DST wobble from QA
  2026-08-05) returning inserts + per-slot location additions; unit
  tests. `CalendarPatternCell` gains optional `locations`.
- **Core**: `createSlots` returns `{created, augmented}` and applies the
  plan; `proposeSlot` unions the proposed location into a reused slot and
  stamps it on a new one; `updateSlot` patches locations; `CalendarSlot`
  and open-slot ICS events expose them.
- **API**: `Timeslot.locations`; `createTimeslots` returns
  `CreateSlotsResult {created, augmented}` and logs aggregation;
  `addSlotSession` rejects a location the slot doesn't offer (and
  requires one when the slot has any); `proposeSlot` requires a location
  when the forum has them configured; `updateTimeslot(locationsJson:)`
  for admin edits (≥1 when provided).
- **Web**: setup card cells get location checkboxes (same-key cells merge
  their locations, mirroring slot aggregation) and generation stamps
  them; a new "One-off dates" section releases irregular dates — e.g.
  hall openings — through the same aggregating mutation; pencil-in
  becomes a required select over the slot's locations with taken ones
  disabled; the location filter matches offered locations and lists
  configured ones even before any slot carries them ("no slots match" =
  not released yet); rows show offered-location chips; admin slot editor
  edits the set; off-piste proposals require a location when configured.
- **Seed**: canonical slots union their fixture slots' locations; derived
  pattern cells carry theirs.
