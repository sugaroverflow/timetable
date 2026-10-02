# Confirm-time locations: pencils location-less, confirms location-full

**Date:** 2026-08-14
**Trigger:** Ed's follow-up to workbench v2 (same day): with pencils now
pure time-intents, the location decision moves to CONFIRM time. A
confirmed session acquires a room, and confirmed sessions are exclusive
per (slot, location) — two confirmed sessions cannot share a room at the
same time. Pencils stay unlimited and location-less; forums with no
configured locations keep confirming without one.

## Model change (migration 0038)

- New partial unique index `slot_sessions_slot_confirmed_location_uq` on
  `(slot_id, location) WHERE status = 'confirmed' AND location <> ''`.
  Pencils (`proposed`) and location-less confirms stay unconstrained. The
  migration dedupes any pre-existing offenders first (keep earliest
  created, then smallest id), 0037-style.
- Core `addSlotSession` no longer accepts a location at all — every new
  booking (pencil-in AND `proposeSlot`'s born-proposed session) inserts
  `location: ""`. `proposeSlot`'s `location` input keeps its slot-level
  meaning: it joins the new timeslot's OFFERED set.
- New core pre-flight `confirmedLocationTaken(slotId, location,
  excludeSessionId)`; `updateSlotSessionRow` gains a `location` patch
  field.

## API (`slots.ts`)

- `addSlotSession` mutation: `location` argument removed.
- `updateSlotSession` mutation: nullable `location` argument
  (null=unchanged / ""=clear, the house convention). Confirming — or
  moving a confirmed session — into a non-empty location that another
  confirmed session holds is `badRequest("That location is already
  confirmed for this time")`; the pre-flight can race a concurrent
  confirm, so the unique-violation from the new index maps to the same
  friendly error (`isConfirmedLocationConflict`). No server-side location
  requirement — the UI enforces the pick when the slot offers locations.
- Permission gates unchanged.

## Web

- `PencilInControl`: location select/input and the `booked` set are gone —
  pencilling is just {choice, (admin custom title/url), Pencil in}.
- `ActiveSessionControls` (now threaded the slot + forum locations): a
  location picker rides with the URL input — a select over the slot's
  offered locations with "(taken)" options disabled (exactly one free →
  preselected), free text with the forum datalist when the slot offers
  none, no picker in location-free forums. Confirm is disabled until a
  location is picked when offered locations exist; after confirmation the
  room stays editable and "Save URL" became one "Save" (url + location).
- `ProposeSlotForm` copy: the location field is what the new timeslot
  OFFERS; the session is pencilled location-less.
- Calendar page `filterByLocation` doc comment refreshed (open slot ≠
  free room anymore); behavior unchanged.

## Tests

Integration: pencil carries no location key at all; confirming with a
free location passes it through to `updateSlotSessionRow`; confirming
into a held location, and moving a confirmed session onto one, are
refused; `proposeSlot` receives the location as the slot's offered one
(the session is location-less by construction — `addSlotSession` has no
location parameter to misuse).
