# 2026-08-06 — Calendar bookings model: timeslots split from sessions

Ed, reviewing the multi-location grouping patch (PR #224, closed
unmerged): "This feels a bit messy. Availability is location independent…
We can have multiple bookings in one timeslot, each related to a
different location. Can you think this through and come up with a
solution that feels intuitive?"

The root cause was the schema: the old `timeslots` rows were
(time × location) units carrying at most one session, so availability —
which is about the time — fragmented across locations, and multi-room
scheduling needed client-side grouping hacks. The fix splits the model:

- **`timeslots` = pure time windows**, unique per (forum, start, end).
  Availability and the discussion thread attach here (one thread per
  time — decided with Ed; per-booking threads can come later if needed).
- **`slot_sessions` = bookings**, zero-to-many per slot, unique per
  (slot, location): a subject (topic / office-hours host / admin-only
  `custom_title` from the same session's earlier feature) + status
  (`proposed`/`confirmed`) + url. An empty slot has no rows — the
  `empty` status value is unused now.
- **Never-displace becomes per-booking**, and *adding* a booking never
  displaces anyone — the location is the contended resource
  (`slotLocationTaken` pre-flight + unique index backstop). Custom
  sessions have no owner, so they gate on the admin bit.
- **API**: `setSlotSession` → `addSlotSession` / `updateSlotSession` /
  `clearSlotSession`; the `Timeslot` GraphQL type carries `sessions[]`;
  `updateTimeslot` edits the time only. `proposeSlot` reuses an existing
  slot at the same window. ICS emits one event per booking (UID =
  session id) plus "Open slot" events; digests and the analysis page's
  unallocated-topics query join through `slot_sessions`.
- **Web**: the row lists its bookings (each with location + status
  pill); the fold gets per-booking confirm/URL/clear rows plus an
  always-available pencil-in control with a location input (datalist
  from forum settings). The elector toggle stays per-slot — one answer
  per time, no broadcast hack.

**Migration 0030** (`0030_familiar_beast.sql`) is data-preserving and
was verified end-to-end on a scratch Postgres 16 (fixtures covering
every path, plus a full `db:seed` run): sessions extracted with their
slot's old location; same-time slots merged into the earliest-created
keeper; each user's LATEST availability answer per merged group
survives; comments merge into the keeper's thread; same-time
same-location double-bookings keep the newer session. One deliberate
loss: locations on *open* slots (the new model has none — the location
list lives in forum settings).
