# 2026-08-15 — the tabs sit above the action bar

Round 2 of Ed's topic-tabs QA, answering the two questions left open by
`2026-08-15-topic-tabs-qa.md`.

## Icon + count beats sideways scrolling

Ed's call on the one-line strip: "nobody enjoys [sideways scrolling] on
mobile really". So the compression is by label, not by scroll — under
640px, on cards carrying three or more tabs, the UNSELECTED tabs shed
their labels and show icon + count; the selected tab always says what it
is. Two or fewer tabs always fit, so `:has(button:nth-child(3))` gates it.

The label is clipped (`clip-path: inset(50%)`), not `display: none`, so it
stays in each tab's accessible name, and `title` carries it on hover.
`overflow-x: auto` and the edge-shadow hint stay as a silent last resort
for a forum with very long role labels — normally nothing scrolls.

## Each heart lives inside its own thread

Ed on the duplicated action bar: "let's put the red heart action bar in
comments tab and the blue heart action bar in host-comments tab, so you
only see one action bar at once. You can also think of this as — the tabs
are 'above' the action bar, not below it."

That framing resolved the design question I'd asked (where should 💙
live?) without moving any visibility boundaries: the ❤️ row simply moved
DOWN into the Comments tab, where 💙 already sat in the {host}-only tab.
Consequences:

- A viewer meets exactly one action bar at a time, and its 💬 count is
  unambiguously that thread's count — previously a host saw two 💬 counts
  meaning different things.
- The Comments tab is now unconditional on feed cards: it carries the ❤️,
  so it must exist even for a viewer who can't comment on a topic with no
  comments. With one live section the card still renders bare, so that
  viewer's card looks exactly as it did before tabs existed.
- Queue mode keeps its decision buttons ABOVE the strip (one call to
  action per card) and passes no ❤️ row into the tab.
- `.card-tab-panel` now drops the top rule of whichever block leads the
  pane, rather than of comment sections specifically — the divider between
  an action bar and the comments below it is a real divider and stays.
- The {host}-only thread's 💬 already overrode its click handler, so it
  never fires `requestOpen()` and can't drag you out of its own tab.

`ActionsSlot` (queue-controls-or-actions-row) is gone; `FeedActionsRow` is
just the ❤️ row, and queue controls render directly.
