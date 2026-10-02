# 2026-08-10 — Feed toolbar becomes a floating glass pill

Ed's design call (backlog item 17, first half): the sticky filter bar
was an opaque full-width strip of `--bg` — it read as *background*, so
scrolling cards seemed to slide "under the background", which makes no
spatial sense. The controls should sit in a translucent pill (Apple
liquid-glass style) that visibly floats *over* the cards.

`.feed-toolbar` redesign (globals.css; markup untouched — all six pages
using `toolbar feed-toolbar` inherit it):

- `width: fit-content` pill (`--radius-pill`), translucent
  `color-mix(var(--card) 62%, transparent)` over
  `backdrop-filter: blur(14px) saturate(160%)` — cards demonstrably
  pass behind glass. Border is `--line` at 72%; `--shadow` for lift.
- Sticks at `topbar + 8px`, so cards also show in the gap above the
  pill while scrolling.
- The ±14px `margin-inline` bleed hack (QA 2026-07-29, hiding card
  shadows at the opaque bar's edges) is deleted — with real
  transparency there is nothing to hide.
- `margin-bottom: -8px` netting is gone too; the visible pill bounds
  make the plain `.stack` gap read correctly.
- `@supports not (backdrop-filter)` falls back to solid `--card`.

Verified live against dev (spt-test-data) by injecting the CSS into the
deployed page via Chrome: light + dark, resting + scrolled. Dark mode
needs no extra rules — the color-mix flips with the tokens.

Second half of item 17 (topic search box, riding inside this pill) is
still to design with Ed.
