# 2026-08-10 — Grab-bag QA: Analysis, Pending pills, log spacing, digest default, invite clarity

- **Analysis subtitle** ("80 topics from 12 faculty sorted by…") reads
  in normal body type — it's the table's summary statistics, not small
  print.
- **Filter changes never scroll to top**: useSetSearchParam passes
  { scroll: false } on push AND replace — fixes the Analysis activity
  table jump; all filter controls share the hook.
- **Pending queue pills never wrap**: .status-badge gains
  white-space: nowrap + flex-shrink: 0, so a two-line title can't fold
  "ready to publish" onto two lines.
- **Log toolbar spacing**: wrapped bars get column-gap 16 / row-gap 6;
  the Live dot anchors to the bar's right end (margin-left auto).
- **Digests default ON for new members**: core getDigestDefaults seeds
  digestEnabled when the forum's digestDefaults were never saved; an
  explicit off still seeds nothing. Email digest card's switch mirrors
  the same default.
- **Invite People honesty**: intro + result copy state that NO email is
  sent at add time (Send invite per card does that); button relabelled
  Add people (was "Send invites" — it never sent anything).
