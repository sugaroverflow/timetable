# 2026-08-16 — workbench polish round 2

Ed's second QA pass over the workbench and sessions tab, six verdicts.

## The sort toggle belongs to the list it sorts

The Date/Availability toggle sat in the workbench's panel head, above
both sections — but it only reorders the Calendar list. `CalendarTable`
gains a `headingExtra` slot rendered on the heading's right edge, and the
workbench passes the toggle there. `PanelHead` keeps just the
whose-availability line.

## Section headings find their level

`.cal-subhead` was small and muted, which read as greyed-out furniture.
Now sans, full ink, `--text-base` semibold: a clear step above the month
eyebrows, below the card-level serif `.section-title`. And the month
dividers drop from primary blue — which read as links — to muted.

## "Your Sessions"

Title case on the workbench section and the calendar page card.

## No cross-booking from another host's card

A host opening someone else's topic card's sessions tab met a "Pencil
in…" control — with no claim topics it could only book their *office
hours* into that topic's slot, pure cross-talk. The tab now strips
`canPropose` for non-admins: it is a viewer surface; booking gestures
live on the calendar and the workbench. (Side effect: a topic's own host
also loses the per-booking URL/clear rows on the card tab — they keep
them on the calendar page and in their workbench.) Admins keep full slot
controls everywhere.

## More two-room evenings in the seed

Five sibling slot blocks added to `dev-sample-data.md` (weeks +2/+3), so
most future weekday slots offer two locations — the confirm-time room
picker, "(taken)" states, and location contention are now exercised by
the seed rather than only reachable by hand-editing slots.
