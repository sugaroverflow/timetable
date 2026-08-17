# 2026-08-17 — core backlog clearance (audit deferred items, Ed's #9)

Ed's call on the audit's deferred list: "now's the time to clear them
up". Everything the correctness pass had parked as not-prod-blocking:

- **Digest sends are no longer at-least-twice** — each forum's watermark
  advances the moment its email is out (was: one end-of-loop mark, so an
  early success followed by a later forum's send failure re-sent the
  successful email next run). Quiet-but-due forums are marked after the
  loop; a mid-loop failure leaves them to recompute (still quiet).
- **Settings saves merge in the database** — `jsonb ||` (coalesced)
  replaces read-modify-write in `updateTimetableSettings`,
  `updateUserNotificationSettings`, and
  `updateMembershipDigestSettings`: two admins saving different Forum
  Settings cards concurrently used to last-write-wins the other's card
  away. Same shallow-merge semantics, now atomic.
- **Export slot discussions in one query** — new
  `listSlotCommentsForSlots` (calendar.ts) batches what used to be one
  `listSlotComments` per commented slot; `listSlotComments` delegates to
  it, so the calendar page path is unchanged.
- **Weekly digests fire on the London weekday** — `isDigestDue` was UTC,
  making a UK forum's "Monday" digest a Sunday/Monday coin-flip across
  BST. `DIGEST_TIMEZONE = "Europe/London"` (a constant with a
  make-it-per-forum note; forums carry no timezone setting yet).
- **Transactions**: `createSlots` applies its whole plan (location
  unions + inserts) atomically — a crash mid-generation used to leave a
  half-applied plan the re-run would re-plan against; `proposeSlot`
  wraps its read-union-insert-session sequence, so a session-unique
  failure no longer strands a location on the slot. `addSlotSession`
  gained an optional executor param to join a caller's transaction.
- **digest_sends retention** — the digests cron prunes send-log rows
  older than a year (`pruneDigestSends`; click-to-read links that old
  are dead anyway). The job response gains a `pruned` count.
- **buildFeed scaling note** sharpened in ARCHITECTURE's risks (search/
  paging are in-memory by design — global weight denominators).
