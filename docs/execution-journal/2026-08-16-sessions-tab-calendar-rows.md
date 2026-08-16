# 2026-08-16 — the sessions tab shows calendar rows

Decision 13 of the row-rationalisation walkthrough. Ed weighed a teaser
that links into the calendar against making the tab's rows real calendar
rows, and chose: "let's try putting ordinary rows and see how it feels."

The tab used to be a line per session — date, status pill, room, and the
elector's own 🟢🟡🔴 — with nothing to expand. It now renders
`CalendarTable`, which means a viewer gets exactly what the calendar page
would give them: the bookings on that slot, the room once confirmed, their
own availability control, and the slot's conversation behind the fold. It
is the last of the five row types to stop being its own implementation.

The list is ungrouped (a topic's own scattered dates are not a chronology),
so its rows carry the year — decision 16's rule.

## Privacy, which is why this became easy

The tab was deliberately austere because "may electors see group
availability" was open. Gating the counts (2026-08-16, decision 15)
answered it: the wash is host/admin-only wherever a calendar row appears,
so putting a full row on a public topic card can't leak what the calendar
page doesn't already show. Tests pin all three cases — elector, anonymous,
host.

## Not fetching the whole schedule

`buildCalendar` did a forum's entire slot list, which would have been a
silly thing to run per topic card. It takes `slotIds` now, and
`listTopicSessionSlotIds` (a cheap join) says which. So the tab's fetch
builds availability and sessions for that topic's handful of slots. For a
viewer who won't see the wash, the audience query is skipped entirely and
the audience passed as empty.

`listTopicSessions` and `TopicSessionRow` are deleted — the slim
projection they existed to produce is exactly what let this surface drift.

## One deliberate difference

The tab passes **no lens and no claim topics**: a comment posted from a
card's Sessions tab is a plain slot comment. The card is where you learn
when a topic runs; arguing for a particular time is the calendar's job and
the workbench's. (Both of those DO attach claims.)
