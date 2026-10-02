# 2026-08-16 — the workbench renders calendar rows

Decisions 10a, 11, 12a, 17 and 18 of the row-rationalisation walkthrough.

The topic-workbench had its own row implementation, which is why it kept
drifting from the calendar's: it had no rooms, no booking lines, no
availability toggle for a host who is also an elector, no admin slot
controls, and its "Your sessions" rows couldn't fold. The fix was not to
close those gaps one by one — it was to stop having two rows.

## What made it cheap

`topicSlotFit` already called `buildCalendar` and then threw away the
sessions, locations, viewer state and comment count before returning a
slim projection. It now returns the calendar's own slot shape, so
`CalendarTable` renders the workbench. The web shares
`CALENDAR_SLOT_FIELDS` and a new `buildCalendarPerms` — both pages derive
a viewer's calendar permissions from one function now, which is the thing
that had quietly diverged.

## What stays workbench-specific (decision 11, unchanged)

1. The wash charts **this topic's hearters**, not the whole forum's — the
   panel's whole reason to exist.
2. Each row carries a **one-click Pencil in / Unpencil** for this topic in
   its right cluster, via `CalendarTable`'s new `rowAction`. The fold
   underneath now also has the calendar's full session controls (confirm,
   room, URL), which the workbench never had.
3. The **Date / Availability** ranking toggle. Ranked lists are ungrouped,
   so their rows carry the year (decision 16's rule) and the past toggle
   moves from the first month heading into the card's own.
4. **The past is off by default**, but there IS a Show past toggle now
   (decision 17). The calendar page's is a link (`?past=1`, a server
   fetch); the workbench's is state, since it's a panel, not a page —
   hence `pastToggle` being a node the caller supplies rather than a flag.

## Pinned rows are ordinary rows now (decision 12a)

"Your sessions" at the top of the workbench used to be locked open with
avatars and no chat. They're ordinary calendar rows in their own card:
they fold, they carry the 💬 count, and unfolding one reaches the same
slot chat as everywhere else. The group is upcoming-only.

## Both sections fold (decision 18)

`CalendarTable` takes `collapsible`, which turns its heading into a fold
control with a count. The workbench's two cards — "Your sessions" and
"Calendar" — each collapse.

## Consequences worth knowing

- The workbench's fold offers **only this topic** as a claim/pencil
  subject. The calendar page is where you work across topics; offering
  "pencil your other topic in here" from inside topic X's panel would be
  a trap.
- An admin opening someone else's workbench gets admin slot controls in
  the fold, because those rows are calendar rows and that's what they do.
- `TopicManager` now takes one `calendar` prop (perms + rooms +
  office-hours word, or null when the forum's calendar is off) instead of
  `calendarEnabled` + `canPencilSessions`.
