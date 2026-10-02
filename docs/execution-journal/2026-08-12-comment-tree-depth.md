# Deep comment threads: 8-level fetch, reply-depth guard, shallow indent

**Date:** 2026-08-12
**Trigger:** Ed hit a "silent reply failure" on prod — replying in a deep
thread on the sociocracy topic appeared to do nothing.

## Root cause

The server allows unlimited reply nesting (`replyToComment` has no depth
check), but every comment-thread query was built from a hardcoded
three-level selection in `apps/web/src/lib/gqlFragments.ts`. A reply to a
level-3 comment saved fine, toasted "Reply posted", then vanished: level-4
comments were never fetched by any page. Digest emails made it worse by
deep-linking (`?reply=…#comment-…`) to comments the page couldn't render.

## Changes

- **comment-tree-fragment** (`gqlFragments.ts`): `commentTree()` now
  generates its nesting to `COMMENT_TREE_DEPTH` (8) instead of a literal
  three levels. Budget check against API limits: the deepest wrapper (the
  queue page: `topicQueue → current → comments`) puts the deepest scalar at
  depth 11 vs `GRAPHQL_MAX_DEPTH` 12; each level costs ~13 vs
  `GRAPHQL_MAX_COST` 500, worst case my-topics (three trees) ≈ 340.
- **reply-depth-guard** (`CommentList.tsx`): `CommentItem` threads a
  1-based `depth` and withholds the Reply button at `COMMENT_TREE_DEPTH`,
  so a reply that couldn't be fetched back can no longer be posted. The
  avatar block moved to a `CommentAvatar` component (complexity budget).
- **reply-indent** (`globals.css`): `.replies` per-level indent cut from
  14px+2px rule to 6px+2px, so 8 levels stay on-screen on mobile.

## Notes

- Comments already stranded below level 3 in prod surface automatically
  once this deploys — expect possible duplicates from retried "failed"
  replies; worth a cleanup pass.
- This is the stopgap Ed chose over a flat-fetch redesign. A follow-up
  product direction (dialogue-first threading: continuing a chain as child
  by default) is under discussion and may change rendering later.
