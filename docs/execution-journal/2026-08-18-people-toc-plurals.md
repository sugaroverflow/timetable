# People TOC counters + role-label plurals (Ed, 2026-08-18)

Three copy fixes in one pass:

- **People-page TOC headings lose their counters** — the names flowing
  under each heading already convey the size.
- **A section of one wears the singular** ("Admin", not "Admins") — the
  heading is computed per-section in `people/page.tsx`, shared by the TOC
  and the section title below so they can't disagree.
- **"Facultys" hunt**: `pluralLabel` (labels ending in s/x/y stay as-is,
  so collective nouns like "Faculty" never grow an "s") already existed —
  but four sites bypassed it with a hard-coded `s`:
  `CalendarSettingsForm`, `HostCommentsForm` (which also pluralised its
  already-singular lowercase vars, producing "facultys"), and the
  admin-gate notices on the log and Pending Topics pages. All four now go
  through `pluralLabel`. The API's email copy already had its own
  s/x/y-aware helper (`email.ts`), so digests were unaffected.

The rule of the house: never append `s` to a role label by hand — always
`pluralLabel` (web) / the `email.ts` helper (API email copy).
