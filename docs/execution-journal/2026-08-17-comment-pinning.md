# Comment pinning by the topic author (issue #258)

**Date:** 2026-08-17 · **Issue:** #258 · **Ed's spec:** author gets
Pin/Unpin under root comments in the Reply-action style; pinned comments
stay at the top "except when someone has just posted a new comment, which
goes above them until reload (otherwise it will look like the comment
disappeared)".

## Shape

- `comments.pinned_at` (migration 0041, additive). `setCommentPinned` in
  core stamps it and logs `comment.pin`/`comment.unpin` with the same
  topic + snippet payload as `comment.hide`, so the activity timeline
  names and links these for free (labels added to `activityLabels.ts`).
- `pinComment(commentId, pinned)` mutation: gated `ownsTopicAsHost` — the
  topic's AUTHOR only, deliberately not admins (their tool is Hide;
  pinning is the author curating their own discussion). Replies are
  refused server-side: a pin that yanked a message out of its chain would
  break the dialogue it answers.
- The server comment tree stays newest-first — teasers and digests read
  "the latest comments" off that order and must not start previewing pins.
  Pinned-first is purely a render concern: `orderRoots` in
  `CommentList.tsx` puts pins on top (earliest pin first, so the author
  curates by pinning sequence), then the rest newest-first.
- **Fresh-above-pins:** `CommentList` snapshots the root ids present at
  mount (`useState` initializer); roots that appear later (the viewer or
  anyone else posting, arriving via `router.refresh`) sort ABOVE the pins
  until the next full page load. This is Ed's disappearing-comment guard:
  the top-composer posts to the top of the stack, and watching your fresh
  comment drop below the pins would read as it vanishing.
- UI: Pin/Unpin button in the `comment-actions` row (root comments only,
  same plain style as Reply/Edit), 📌 with a hover title in the pinned
  comment's name row. Wired on the public thread (feed, permalink, queue,
  My Topics); host-only and drafting threads don't offer it.
- `pinnedAt` is selected on thread ROOTS only — `commentTree()` prepends
  it at the top level instead of repeating it through all 8 nesting levels
  of every thread query (it's always null on replies, and each nested copy
  would cost query budget).

## Tests

API integration: admin non-author refused, author pin lands (payload
returns the stamp, core called with the actor), reply refused. The core
mock gained `getViewerRoles: vi.fn(async () => [])` — `commentNode`'s
author-pill lookup must not reach the real DB now that a mutation test
resolves it with a real timetable id.
