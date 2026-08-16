# 2026-08-16 — QA polish: bare tab panes, teaser focus, workbench fold fix

Ed's QA round on the rationalised rows, seven small verdicts in one pass.

## Tab panes lose their inner chrome

`CalendarTable` gains two presentation props: `title` can be null (no
heading at all) and `card={false}` drops the `.card` wrapper. The sessions
tab uses both — the tab strip is its heading and the topic card its frame,
so a titled inner card read as clutter — and also loses its "Open the
calendar" link, since every page's sidebar already links the calendar.
The workbench's two sections go `card={false}` too; their headings drop
from the serif `.section-title` to a quiet sans `.cal-subhead` (they sit
levels below the topic card's own title) and lose their row counters.

## The workbench fold never actually folded

`CalendarTable`'s collapse used `hidden={!showRows}` on `.cal-list` —
but `.cal-list { display: flex }` is an author rule, and any author
`display` beats the UA stylesheet's `[hidden] { display: none }`. The
rows now conditionally render instead. (Folding a section resets its
rows' open state; acceptable.)

## Teasers land you on the dialogue

Clicking a comment-teaser preview line now opens the tree *focused on
that comment's reply composer*: the click shallow-writes `?reply=<id>`
via `history.replaceState` (which Next feeds into `useSearchParams`) and
the chain-tail composer's existing deep-link focus does the rest — one
mechanism for digest links and teaser clicks alike. The "💬 n comments"
pill still opens unfocused. The teaser block also gets 4px more air under
the composer and a 36px indent (the comment text column: 26px avatar +
10px gap), so previews read as part of the thread below.

## The sessions-tab wash is the topic's demand

`topicSessions` computed its host/admin wash over the forum's whole
electorate (`{kind: "all"}`). A wash on a topic's card should chart that
topic's demand, so it now uses `{kind: "hearted_topic"}` — the same
audience the workbench charts.

## One string for the drafting-thread hint

The composer hint said "only the {Host} and {Admins} can see this" for
moderators — which reads as ALL hosts seeing the thread (the same
misreading Ed flagged for the panel trigger on 2026-08-11). Every viewer
now gets "only you and the {Admins} can see this"; `hostLabel` left
`AdminCommentsBody`/`AdminCommentsPanel` with it.

## Every My Topics card wears the strip

A fresh submitted topic (drafting thread only) fell back to the old
collapsible panel; `TopicTabs` gains `stripWhenSingle` and My Topics
sets it, so a one-tab card carries the same furniture as its published
neighbours. Feed cards keep the bare single-pane presentation.
