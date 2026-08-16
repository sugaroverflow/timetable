# 2026-08-16 — group availability is host/admin-only, for real

While inventorying the calendar row types I checked whether the wash was
gated server-side or only visually, and found: only visually. Every viewer
of a calendar — electors, and anonymous visitors to a public forum — was
served each slot's 🟢🟡🔴 totals (`slots.ts`, `Timeslot.counts`). The UI
hid the tint from them; the payload didn't.

Ed's call (decision 15 of the row-rationalisation walkthrough): gate it,
"which makes the deferred question a real answer rather than an
accident". So `Timeslot.counts` is now null for anyone who fails
`canSeeHostOnly`, exactly like `perUser` beside it.

One consequence, applied without asking because leaving it would have made
the decision meaningless: a **claim comment's frozen snapshot** carries the
same numbers, and slot chats are open to every member. `slotComments` now
strips `counts` from the rows it returns to non-hosts — they still see the
📌 chip and which topic was claimed, just not its tallies. The stripping
happens in the query resolver rather than the field, since that's where the
viewer is known.

Electors lose nothing else: they still read every slot, see the sessions,
set their own 🟢🟡🔴 and talk in the chat. What they can't do is total up
everyone else's availability.

The web's `CalendarSlot.counts` is nullable to match, and the two places
that render it (the tint layer, the claim chip's live preview) now check.
Tests cover the calendar query for host vs elector, and claim snapshots
for the same pair.
