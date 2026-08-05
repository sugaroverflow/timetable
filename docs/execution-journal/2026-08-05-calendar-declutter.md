# 2026-08-05 — Calendar declutter: slot-state filter, on-demand meters

Ed: the calendar "performs two roles simultaneously — showing upcoming
events that have been pencilled and confirmed, and also showing per-topic
availability — and while you sometimes want to see both there is maybe
some possible simplification." Review sharpened that to three jobs
(schedule to consume, workbench to produce, input form for electors) with
every row carrying all the apparatus at once. Agreed changes (elector
page deliberately untouched beyond the shared filter; a page split was
rejected — it would sever the see-availability → discuss → pencil loop):

- **Slot-state filter** (`?show=sessions|open`, `SlotStatusFilter`) joins
  the lens and location selects in the toolbar: All slots / Sessions
  (pencilled or confirmed) / Open slots. The two jobs get their own views;
  the unified chronology stays the default. The toolbar now renders
  whenever slots exist (it used to hide for electors without locations).
- **Meters demoted to counts while scanning.** The full-width avatar
  meter is workbench apparatus; rows now show a slim counts-only bar
  (`avail-meter-compact`, same 🟢🟡🔴 proportions, tooltip intact). The
  avatar meter returns exactly when the viewer is deciding: any lens
  active (`?audience=` present — a topic or "anyone who ❤️'d my topics"),
  or that row folded open.
- **Lens copy:** "All ❤️s on all my topics" → "Anyone who ❤️'d my topics".
- **Admin setup card** swapped its `CollapsibleSection` fold for the
  reveal-in-place button pattern ("Propose a different time", "Create New
  Topic"): a plain "Set up the schedule (Admins only)" button until
  pressed, with a Close action next to Save.

Considered and declined by Ed: schedule-first reordering for electors
(their page is fine), a "this week" highlight (nearest dates already
top), promoting Show/Hide-past out of the month heading (niche), and any
change to the 💬-as-only-control affordance (it's the only per-row
control, so people click it).
