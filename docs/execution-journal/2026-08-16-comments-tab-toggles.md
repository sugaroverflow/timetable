# 2026-08-16 — the Comments tab button folds the tree back

Ed: "clicking on the comments-tab button should open and close the tree."

Clicking the tab you are already on did nothing — Base UI fires no value
change for it — so the obvious control for the discussion was a dead
click, and once the tree was open there was no way to fold it away again
(the teaser only ever opened, one-way, since 2026-08-13).

`CommentsOpenScope` now carries two channels rather than one:

- `requestOpen` — the 💬 button and posting a comment. Always opens. This
  one must never fold: having just posted, you want to see the thread.
- `requestToggle` — the Comments tab button, and only when that tab is
  already active. Flips.

`CommentTeaser` keeps real state again instead of the old
`open || requestId > 0` derivation, adjusting it in render from both
channels (the "information from previous renders" pattern `TopicTabs`
already uses for snapping back to Comments). Folding the tree does not
un-mark it seen — `markCommentsSeen` still fires once, on first open.

Two edges worth knowing:

- Arriving on the Comments tab from another tab does NOT open the tree.
  The panel remounts collapsed and the next click opens it. Opening on
  arrival would mean the teaser previews only ever showed on the card's
  default tab, which would waste them.
- A card with only one live tab renders bare, with no strip and therefore
  no tab button, so its tree still opens one-way from the pill. If that
  asymmetry bites, the fold affordance would need to live in the teaser
  itself.
