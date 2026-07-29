# Comment edit/delete by authors + edit-in-place everywhere

**Date:** 2026-07-29

Ed's QA: users couldn't edit or delete their own comments; and app-wide,
"edit" actions stacked a composer *below* the text instead of swapping
it in place.

## Comment edit + delete

- `editComment` / `deleteComment` mutations, author-only (admin
  moderation stays on `hideComment`, deliberately separate). Edit has no
  time limit — comments carry no hearts, so no vote-integrity concern —
  and stamps a new `editedAt` column (`updatedAt` can't drive the
  "(edited)" marker; hide/unhide bumps it too).
- Delete is soft (`deletedAt`, migration 0023): the tree builder prunes
  childless deleted comments bottom-up and keeps a tombstone where
  replies survive — body/author blanked **server-side**, so deleted text
  never reaches a client. Deleted comments drop out of comment counts,
  Analysis 💬 metrics, digests, and notifications (`isNull(deletedAt)`
  at every query site; the digest replies section also gained the
  hiddenAt filter it always should have had).
- UI: Edit/Delete on your own comments in every thread tier;
  `CommentEditForm` swaps in place of the comment text; delete confirms
  first; "(edited)" marker with the exact time on hover. `viewerId` now
  threads through every CommentList call site (feed cards, permalink,
  host-only and drafting panels, My Topics, Pending Topics).

## Edit-in-place (the app-wide rule)

New `TopicEditScope` (client context): a card's rendered content
(title/cover/body) is REPLACED by `TopicEditForm` while editing; the
Edit buttons in the tail drive it via context. Applied to feed
`TopicCard`, `TopicManager` (My Topics), and `ModerationCard` (Pending
Topics) — previously all three kept the content visible and opened the
form underneath. `Host/AdminTopicActions` keep a local below-the-bar
fallback only for unscoped call sites.

Integration test: non-authors get errors and no write; authors edit
(with editedAt) and soft-delete. NB the test asserts on error presence,
not message text — GraphQLErrors get masked to "Unexpected error." under
vitest's dual graphql module instances.
