# 2026-08-10 — Five-item QA: glass lighter, inset bar, symmetric actions,
# calendar control rows, sidebar selection

Ed's five, all verified live (light mode, measured where measurable):

1. **Light glass lighter still**: `--glass` light mix → white 84% /
   accent 4% (was 70/5) — unmistakably lighter than the grey page.
2. **Bar inset 20px from the feed edges** on desktop
   (`margin-inline: 20px` ≥640px) — cards visibly slide under it rather
   than butting flush.
3. **❤️ row symmetric**: above the pill was 9px (pad+rule) but below was
   22px (pad + the card's 14px stack gap before the comments rule).
   `.card-actions + .comments { margin-top: -13px }` → measured 9/9.
   Thread-stack panels (no rules) reset to 0.
4. **Calendar fold controls**: Pencil-in row moved ABOVE the per-booking
   URL rows; both become `.cal-controls-row` — full column width like
   the comments composer, with the flexible element (pencil select / URL
   input) growing and buttons at natural width. Fixed inline widths
   (220/180/140) dropped; location/title/link inputs flex-basis 160.
5. **Sidebar selection**: `.nav a.on` deepens with 10% accent mixed into
   `--primary-soft` — no longer light-blue-on-light-grey.
