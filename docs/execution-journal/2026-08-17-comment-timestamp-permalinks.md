# Comment timestamps are permalinks (issue #259)

**Date:** 2026-08-17 · **Issue:** #259 · **Ed's word:** "5. let's go!"

Every topic comment's name row now carries a faint relative timestamp
("2 hours ago", exact date-time in the hover title). Where the thread knows
its topic's URL, the timestamp is a link to `<topic permalink>#comment-<id>`
— the anchors, scroll-margin past the topbar, and `:target` highlight ring
all shipped with the activity-log overhaul (#314), so this rides them.

## How

- `CommentTime` in `CommentList.tsx`: relative label via `lib/relativeTime`
  (a plain helper, so `Date.now()` stays out of component render — the
  react-compiler purity pattern), `suppressHydrationWarning` because the
  server and client render moments differ.
- `CommentList` gains an optional `topicHref` prop, threaded through
  `CommentItem`/`ChainBlock`/`CommentBubble` so every depth gets it.
- Wired at every thread surface: `TopicCard` (Comments / {host}-only /
  drafting tabs — feed, permalink, queue), `MyTopicsTabs` (all three
  panes; permalink built with `topicPath`, host id falling back to the
  viewer since My Topics is the host's page), `ModerationCard`'s drafting
  panel. `HostOnlyThreadBody`, `AdminCommentsBody`/`AdminCommentsPanel`
  pass it through. Without `topicHref` the timestamp renders as plain text.
- `.c-time` in `globals.css`: 11px, `var(--faint)`, quiet link (underline
  on hover only), matching `.tl-quote-link`'s manner.

Slot comments (`SlotDiscussion`) are out of scope — their home is a
calendar row, which has its own `#slot-<id>` anchor linked from the log.
