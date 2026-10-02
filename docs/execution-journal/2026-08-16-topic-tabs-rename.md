# 2026-08-16 — the strip is called topic-tabs

Ed named the strip "topic-tabs" on 2026-08-14 and the docs adopted it
immediately; the code kept saying `CardSectionTabs` / `CardSection` /
`buildFeedSections` / `.card-tabs`. This sweep closes the gap. No behaviour
change — every check was green before and after.

- `CardSectionTabs.tsx` → `TopicTabs.tsx`, `CardSection` → `TopicTab`, and
  the component's `sections` prop → `tabs`.
- `TopicCardTabs.tsx` → `MyTopicsTabs.tsx`. With the generic strip now
  called `TopicTabs`, "TopicCardTabs" was a name you could misread at a
  glance; `MyTopicsTabs` says which page it assembles. Ed's naming rule
  applies — literal and descriptive, never clever.
- `buildFeedSections` → `buildTopicTabs`, and the per-tab builders in both
  files are `commentsTab` / `hostTab` / `adminTab` / `sessionsTab` /
  `schedulingTab`, matching how Ed refers to the panes in conversation.
- CSS `.card-tabs` → `.topic-tabs`, `.card-tab-panel` → `.topic-tab-panel`.
- `CommentSection` in `TopicCard.tsx` is untouched: it's the comment
  thread's own component, not a tab, and `.comment-section` is its class.

Glossary, `ARCHITECTURE.md` and `PRODUCT.md` follow. The execution journal
keeps the old names where it already used them — those entries are dated
records of what the code was called at the time, and rewriting them would
make them lie.
