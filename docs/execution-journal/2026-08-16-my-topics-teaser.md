# 2026-08-16 — My Topics teases its comments like the feed

Ed, QA'ing My Topics:

> comments-channels start expanded; instead it should have the same
> behaviour as in the feed (teasers and "x comments" pill to expand)

My Topics rendered the whole public thread inside its Comments tab, so a
host with three chatty topics scrolled past every comment on all of them.
The pane now wraps the thread in the same `CommentTeaser` a feed card
uses: composer on top, previews of what's new since the host last engaged
(padded to the three latest), and a "💬 n comments" pill that opens the
tree in place.

Two things had to follow it across:

- **The watermark.** The teaser's "new" line is measured against the
  viewer's per-topic `comment_seen` row, which only the feed's topic
  payload carried. `loadCommentsSeen` in `packages/core/src/topics.ts` is
  exported now (it was already batched, for exactly this shape) and
  `attachManagedCommentTrees` loads it alongside the three comment trees
  in the same `Promise.all`, so the dashboard costs no extra round trip.
  `ManagedTopic.viewerCommentsSeenAt` exposes it. The moderation queue
  passes no viewer and reads as "never engaged" — it doesn't tease.
- **The open channel.** `CommentsOpenScope` wraps the My Topics tab strip
  now, which is what makes posting a comment unfold the teaser you just
  posted into. The strip deliberately does NOT take `followCommentsOpen`:
  on a feed card that snaps the strip back to Comments, but here a host
  posting in the {host}-only tab should stay in the {host}-only tab.

Only the public thread teases, matching the feed exactly — the faculty and
drafting tabs still open fully. Those are places you go on purpose, and
they carry the conversation you clicked the tab for.
