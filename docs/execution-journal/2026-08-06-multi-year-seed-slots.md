# 2026-08-06 — Seed data: a multi-year calendar and a wider ❤️ spread

Ed asked for richer seed data: a few years of slots, several locations,
many pencilled and booked events, and topics at both extremes of the
heart tally.

- **`scripts/generate-seed-slots.mjs` (new).** Same pattern as the
  comments generator: deterministic (fixed PRNG seed), re-runnable,
  splices its output into `dev-sample-data.md` between a GENERATED
  marker and "## Notes for engineers". It emits ~570 slots across ten
  ~11-week terms spanning weeks −110..+47 (≈ June 2024 → July 2027,
  always relative to the seed run, so the history rolls forever). Past
  terms are mostly booked (confirmed, ~70% with Luma URLs); future terms
  mix booked / pencilled (some with claim comments + frozen 🟢🟡🔴
  counts) / open. Sprinkled through: parallel bookings (a second session
  in the same time window, different room — exercising the bookings
  model's session-per-slot merge; 22 windows end up double-booked),
  office-hours sessions, off-grid Saturday/evening proposals, and
  availability answers on ~40% of future slots. The hand-authored
  current-window slots (weeks 0..+3) stay above the marker, untouched;
  pattern-only electors (grace/oscar/yuki/ben) never appear in generated
  availability. Locations grow to seven presets (+ Seminar Room, Library,
  Auditorium).
- **Seasonal terms in the seed.** `buildCalendarSeedSettings` previously
  wrapped all slot dates in one "Autumn term"; with three years of slots
  that would be a single 3-year term. `deriveTerms` now splits the sorted
  grid dates wherever consecutive slots are >3 weeks apart and names each
  run by season + start year ("Autumn term 2025"), suffixing on
  collision. The seeded forum gets ten terms.
- **❤️ spread 1→20.** The hearts table previously ran ~3–14 per topic.
  Now topic-ai carries every eligible hearter (19 electors + host-eli),
  data-visualisation-nash 17 and the-nature-of-voting 16, while
  metaphors-of-the-collective and security-and-privacy-in-ml sit at a
  single heart (structured-data-extraction and
  cryptography-threat-modeling at two) — both extremes of the tally UI
  are QA-able.

Verified by seeding a throwaway Postgres 16 container: 568 canonical
timeslots (590 fixture blocks, 22 merged parallel bookings), 482
sessions (363 confirmed / 119 proposed), 10 terms, hearts 1–20.
