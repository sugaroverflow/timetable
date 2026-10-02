# 2026-08-10 — Glass alpha, 15px inset, calendar rows align to compose box

- Light-mode glass slightly MORE transparent: white 84% → 75% (the 84%
  round overshot after the earlier too-similar-to-bg fix).
- Toolbar inset 20px → 15px (Ed's live correction mid-round).
- Calendar fold control rows align with the COMPOSE BOX ("Talk about
  this timeslot…"), not the full column: .cal-controls-row margin-left
  36px = 26px .avatar-sm + 10px .comment gap, so {pencil select, Pencil
  in} and {URL input, Save URL, Clear} share the composer's exact
  left/right edges.
