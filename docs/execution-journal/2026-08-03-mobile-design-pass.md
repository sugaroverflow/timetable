# 2026-08-03 — Mobile design pass (calendar stacked layout)

Audited every page at 375×812 against hosted dev with a Playwright script
(sign in as the seeded admin, full-page screenshot + measure
`scrollWidth − clientWidth` per page, plus an elector pass via "View as
user"). Every page was already sound on mobile — single-column stack,
drawer nav, cards, queue, permalinks all fit — except the calendar, which
had three compounding width bugs:

1. **Audience-filter select widened the whole page (+216px).** A native
   `<select>` sizes to its longest option, and the topic-lens options carry
   whole topic titles. `.select-minimal` now caps at the toolbar line
   (`min-width: 0; max-width: 100%`) and ellipsizes the value.
2. **The slot table was ~580px wide** (💬 | nowrap when-cell | meter
   min-width | you-toggle), so the availability meter, session lines, and
   the entire fold hid behind `.table-wrap`'s sideways scroll. Under 640px
   the table now **stacks** (Ed picked stacked over a slim single-row
   variant): rows become flex blocks — 💬 + when (+ the elector's own
   🟢🟡🔴 toggle right-aligned) on the first line, the full-width avatar
   meter beneath (`order` sends it past the you-cell), session lines and
   the fold spanning the whole block. Row rules move from `td`s to the row
   blocks; the mobile selectors mirror the base rules they out-cascade
   (`.data-table td:not(:first-child)`'s nowrap, `.cal-week-start td`'s
   3px border). Meter faces shrink to 15px so a ~20-elector audience fits
   one line.
3. **The pencil-in select blew the fold out by ~340px** — same
   longest-option physics inside `.cal-fold`, where `contain: inline-size`
   zeroes the fold's contribution but visible overflow still extends the
   scroll area. All fold selects/inputs now cap at `max-width: 100%`.

Verified against dev by injecting the edited `globals.css` over the live
page (later-in-cascade wins ties, so it simulates the deploy): 0px document
and table overflow in admin, admin+fold-open, and elector-preview views.
