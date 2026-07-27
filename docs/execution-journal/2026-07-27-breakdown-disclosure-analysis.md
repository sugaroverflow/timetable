# 2026-07-27 - ❤️ breakdown for all signed-in users; /analysis route

## What happened

QA: the feed's "show ❤️ breakdown" was a separate host/admin-only box at
the card's tail; the Analysis leaderboard repeated a labelled toggle line
per row. Both are now one consistent disclosure: a triangle caret —
`BreakdownCaret` + `BreakdownPanelBody` (`BreakdownPanel.tsx`) — that any
signed-in viewer can open. On topic cards it sits left of the ❤️ button
(new `TopicActionsRow` client component, replacing the server-rendered
row); on Analysis rows it sits inline before the topic name.
`BreakdownToggle.tsx` is deleted. The Analysis page also moved:
`/dashboard` → `/analysis` (nav already said "Analysis"), with a
permanent redirect and `analysis` added to RESERVED_SEGMENTS.

## Visibility change (deliberate, flagged to Ed)

`topicWeightedBreakdown` (and the parallel `Topic.weightedBreakdown`
field) was host/admin-gated; it now requires only a signed-in viewer of a
readable forum. What this newly shows electors:

- **Per-elector L1/L2/devotion weights** — derivable from the already
  reader-visible who-hearts-what matrix (person pages, PR #111), so not
  genuinely new.
- **Column sums** = the topic's weighted scores — likewise derivable.
- **The "Hearted" date column** — genuinely new to electors; when each
  elector ❤️'d was previously host/admin-only. Judged mild and shipped;
  stripping the column for non-host viewers is a one-line change if it
  ever matters.

Anonymous visitors still get nothing (the resolver returns null without
`ctx.user`), and the `weightedScore`/`l2Score`/`devotionScore` fields on
Topic keep their host/admin gates — the breakdown is the deliberate
opening, not the whole scoring surface.
