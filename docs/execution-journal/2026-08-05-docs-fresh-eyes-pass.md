# 2026-08-05 — Docs fresh-eyes pass

Ed: the docs had become hard to read "because of successive changes to the
product — there's a lot of 'this (formerly this)'"; the README emphasised
small details over the product's goals; PRODUCT.md was dated and repetitive.
Rewrote for a new reader who knows nothing about the product:

- **README.md** rewritten to lead with what Topic is for (the
  propose → vote → discuss → schedule loop) instead of a feature laundry
  list. The four-paragraph seeding minutiae collapsed to one paragraph with
  a pointer to DEPLOYMENT.md; the "Status" section (a phase/PR changelog)
  deleted — history lives in the execution journal and git; testing section
  condensed to the CI command list.
- **docs/PRODUCT.md** rewritten in forum/Topic language throughout (it used
  to use code-side "timetable" naming), opening with product goals and
  stances (weighted voting not raw likes, one person one gesture, decision
  venue not social network, coordination over automation). Date stamps, PR
  numbers, and "(this replaced X)" asides removed; the Implementation
  Status phase table dropped; the Go-Live checklist folded into a short
  operational-follow-ups list. Added the Topic Queue and Analysis, which
  had never made it into the product doc.
- **docs/ARCHITECTURE.md**: the rebrand preamble now states the
  say-forum/say-timetable boundary as a rule rather than a dated event;
  scattered date/version annotations trimmed.
- **Stale facts fixed everywhere** (verified against code/specs): the
  topic.forum domain cutover has happened (primary in `.do/app.yaml`,
  timetable.love an alias) — README/PRODUCT/ARCHITECTURE/DEPLOYMENT all
  said it was pending; calendar slot actions ARE activity-logged
  (`slot.pencil`/`slot.confirm`/`slot.clear` in core), removing a Known
  Gaps entry that contradicted PRODUCT.md's own Calendar section; the old
  `timetable.love-logo-transparent.png` asset is already deleted
  (`apps/web/public/` is empty), so both docs that promised to remove it
  at cutover stopped mentioning it. The export-excludes-calendar-data gap
  was re-verified as still real (`packages/core/src/export.ts`) and kept.

Branched from `feat/calendar-declutter` (PR #217 also touches PRODUCT.md);
stacked PR, merges cleanly once #217 lands.
