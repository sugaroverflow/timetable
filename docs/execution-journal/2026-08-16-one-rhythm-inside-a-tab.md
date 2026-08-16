# 2026-08-16 — one rhythm inside a tab

Ed: the ❤️ button in the Comments tab overlapped the horizontal line
underneath it, and asked whether the two action bars are laid out the same
way. They were not.

## What the two bars actually were

The bars themselves are the same pieces — `BreakdownCaret`, a
`HeartButton`/`HeartCount`, `FocusCommentButton` — so the trouble was all
in the box around them.

The {host}-only bar lives inside `.host-thread.thread-stack`, which has
long carried panel rules: `.thread-stack .card-actions` drops its border
and all its padding, `.thread-stack .card-actions + .comments` resets the
pull, and a 10px gap spaces everything. A clean bar.

The Comments bar, since the ❤️ row moved into the tab on 2026-08-15, was a
direct child of the tab panel and kept its CARD-level styling: a top rule
(suppressed by the first-child rule), `padding: 8px 0` (top half
suppressed, bottom half not), and — the actual bug — the
`.card-actions + .comment-section { margin-top: -13px }` pull.

That pull dates from QA 2026-08-10 and exists to cancel the card's 14px
`.stack` gap, so the air above and below the ❤️ pill reads equal on a
plain card. A tab panel has no such gap. With nothing to cancel, the
comments rule simply rode 13px upward — straight through the pill.

## The fix

The tab panel is now a 10px-gapped flex column, i.e. the same rhythm
`.thread-stack` uses:

- `.topic-tab-panel > .card-actions` drops its border and padding, exactly
  as `.thread-stack .card-actions` does.
- `.comment-section` and `.host-thread` drop their own top rules inside a
  panel: the strip's bottom rule is the pane's only divider, and neither
  tab now draws a line between its action bar and its thread.
- Both card-level pulls (`+ .comment-section`, `+ .comments`) reset to 0
  inside a panel. The flex gap owns the spacing.

Untabbed cards — a card with one live tab renders bare, inside the card's
own 14px stack — keep every one of those rules, which is why they were
right in the first place.
