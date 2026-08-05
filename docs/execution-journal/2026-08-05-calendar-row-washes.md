# 2026-08-05 — Calendar rows become the chart: bars → row washes

Ed's spec, hours after the declutter round shipped: stacked full-width
availability bars "create a regular pattern of long, high-saturation
horizontal lines that's uncomfortable to look at" — each row contributed
three horizontal elements (divider hairline, bar, text baseline), ~20
parallel lines down a list. "The fix is to make the row itself the chart:
one object per row instead of three."

The `<table>` (with its 💬-button caret column, when-cell, meter cell,
you-cell, session sub-row, and detail sub-row) became a flex list of
blocks:

- **One rounded block per slot** (min-height 52px, radius 8px, overflow
  hidden). No hairlines, no primary week rules: rows sit 3px apart, weeks
  8px (3px list gap + 5px `cal-week-start` margin).
- **The tint layer** (`.cal-row-tint`, absolute inset-0 flex,
  host/admin-only) carries availability as washes:
  `color-mix(in srgb, var(--green) 16%, transparent)` / amber 13% / red
  13% — low-alpha composites over the surface per spec, NOT pale hexes,
  so dark mode works untouched. Green runs stronger because it reads
  weaker at equal alpha. Hover or `:focus-visible` raises all three ~6
  points, so the saturated version exists on exactly one row at a time.
- **Single content line** above the tints: **Fri 9 Oct** 14:00 – 16:00
  ·small location· | Author: **Topic** (status pill, the existing
  `SessionLine`) | right-aligned 💬 count (only when non-zero) and the
  elector's own 🟢🟡🔴 toggle. Session text clips under ellipsis rules;
  on mobile it wraps to its own line instead.
- **The fold** (under-specified in the spec; decisions made): the whole
  row is the toggle target for hosts/admins — role="button", tabIndex,
  Enter/Space, with clicks on interactive descendants
  (`a,button,input,select,…`) exempt via `closest()`. Expanding grows the
  same tinted block: avatars first, each group aligned under its wash
  segment (`.cal-fold-avatars`, widths mirror the tint), then discussion,
  then session/admin controls. Comments still lazy-load on first open.
- The `lensActive` prop died: avatars are no longer promoted page-wide by
  the lens (the fold owns them); the lens still re-scopes every row's
  counts/tints server-side. Deleted CSS: `.avail-bar`, `.avail-meter` (+
  compact variant from the same morning), `.cal-table` grid, the
  speech-bubble button, `.cal-fold`'s `contain: inline-size` (a
  table-layout workaround divs don't need), the dead `.cal-avatars`
  strip, and the whole mobile table-unwinding block.

Spec deviations, deliberate: date format stays en-GB "Fri 9 Oct" (no
comma — QA 2026-08-02 pinned it); the elector toggle keeps its
right-cluster seat (spec was silent; electors have no tints, their rows
are just quiet lines with a toggle).
