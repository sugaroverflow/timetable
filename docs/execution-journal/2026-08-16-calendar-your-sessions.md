# 2026-08-16 — "Your sessions" on the calendar page

Ed: "The calendar should also have a 'your sessions' section at the top,
for hosts with sessions" — the same move the topic-workbench got earlier
today, now on the shared calendar.

A host's own sessions were scattered down a chronology of everyone's, so
the page answered "what is this forum doing?" but not "what am I doing?".
The page now opens, above everything else, with a "Your sessions" card:
future slots carrying something of yours.

Details worth keeping:

- **Yours** means a session on a topic you host, or your own office hours.
  Admin custom sessions belong to nobody and never qualify. A viewer with
  none gets no card at all — no empty state to scroll past.
- **The same rows**, from the same `CalendarTable` with a `title` and no
  past toggle, so a session cannot look different in the two places, and
  the row keeps everything it has below: the wash, the discussion fold,
  the confirm/unpencil controls. They stay in the chronology too, exactly
  as pinned rows do in the workbench.
- **Read off the UNFILTERED calendar.** The toolbar's location/state
  filters shape the list below; yours shouldn't disappear because you
  narrowed the view. Past slots are excluded even under `?past=1` — the
  section is about what's coming.

`CalendarPage` passed the lint complexity limit with the extra branch, so
the section is its own `MySessions` component that returns null when empty
— the conditional lives inside it rather than in the page.
