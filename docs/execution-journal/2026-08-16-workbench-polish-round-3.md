# 2026-08-16 — workbench polish round 3

Three follow-ups on round 2, all in the workbench.

## The controls get their own row

Round 2 put the sort toggle *in* the Calendar heading; Ed wanted it
*under* it, with Show past on the right. `CalendarTable`'s `headingExtra`
(one round old, workbench-only) becomes `controls`: a space-between row
rendered below the heading, folding with the rows — sort toggle left,
Show past right. The workbench stops passing `pastToggle`, so Show past
no longer rides the first month break there; the calendar page's own
month-break link is untouched. The row renders unconditionally with an
`:empty` display rule, keeping `CalendarTable` under the complexity
limit.

## The serif that wouldn't die

Round 2 declared `.cal-subhead` sans by omission — but it is an `h3`, and
the global `h1–h3 { font-family: var(--serif) }` rule filled the gap, and
the avseg buttons inside inherited it too. Explicit
`font-family: var(--sans)` on the subhead; the toggle now lives outside
the heading anyway.

## Less copy

The "Availability of the n ❤️ on this topic. Pencil in every time you
could run it." helper line is removed. The zero-hearters variant ("No
❤️s yet — the washes fill in…") stays: an empty wash still deserves a
why.
