# Rhythm & alignment pass

**Date:** 2026-07-29

Ed's design directive: a careful pass over spacing rhythm, alignment
(horizontal and vertical), and hierarchy — plus "bump all the heading
sizes up".

- **Type scale**: tiers are now page title **30** (`--text-4xl` bumped
  26→30) > section header **24** (`.section-title` moved onto
  `--text-3xl`) > topic/item titles **20** (`--text-2xl`), against 15px
  body — every tier visibly larger than the next and none near body
  size. All three get `--lh-tight`.
- **Headings bind downward**: `.stack > .section-title` now carries
  +10px above / −4px below, so a header sits 24px from the previous
  block and 10px from the content it introduces (was equidistant).
- **Ghost-control indent**: invisible padding+border on ghost buttons
  indented their labels relative to the column edge — Ed's example was
  the theme toggle in the sidebar foot; it now pulls its box left so the
  label aligns and the hover wash bleeds harmlessly.
- **❤️ action row**: dropped its 12px horizontal padding — the heart
  pill's box and the weight chip now share the body text's edges instead
  of sitting inset between two full-width rules.
- **Comment avatar ↔ username**: the row top-aligned the avatar against
  a bubble whose padding pushed the name 8px down. The avatar now nudges
  5px to centre on the username's line box.
- **Composer ↔ send button**: the textarea's intrinsic height is ~41px
  but the send circle assumed 38 — bottoms never met. The button now
  stretches to exactly the field's height (including user resizes);
  Cancel buttons stay centred.

Deliberately unchanged: activity day labels and empty-state titles stay
small (established); card-internal section headers keep their inline
margins (they head a card, not a stack run).
