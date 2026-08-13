# Dialogue-first threading: chains, tail composers, comment teasers

**Date:** 2026-08-13
**Trigger:** Ed's product direction after the deep-thread QA: real threads
are mostly dialogues (A→B→A→B), rarely branches — so continuing the
conversation should be the zero-effort default, and branching the rare,
deliberate gesture.

## The model

- **Root-attach chains** (Slack-style storage): the chain-tail-composer
  posts its message as a child of the chain's PARENT comment, not the
  previous message. A dialogue stays one level deep no matter how long it
  runs; tree depth only grows on genuine forks, so the 8-level fetch
  (2026-08-12) is effectively inexhaustible.
- **top-composer**: the new-strand composer sits at the TOP of the comment
  stack; top-level comments order newest-first (`buildCommentTree` sorts
  roots desc) so a fresh comment appears where it was typed. Chains stay
  oldest-first — dialogues read downward.
- **chain-tail-composer** (`ChainTailComposer.tsx`): slim "Continue this
  thread…" input ending every chain (each top-level comment, and each
  forked comment with children), gated by the reply-depth-guard. Digest
  `?reply=` deep links focus the right tail (the target's chain).
- **Reply = fork**: the per-comment Reply button now only shows on chain
  messages (depth ≥ 2) and opens a sub-chain — top-level comments continue
  through their tail instead.
- **comment-teaser** (`CommentTeaser.tsx`): feed/queue cards collapse the
  discussion to the latest top-level comment + "x new comments" (vs the
  viewer's feed watermark), unfolding inline. Replaces `FoldedComments`.
  The permalink page renders everything open (`discussionOpen`).
- **chain-reply digests**: the `replies` digest kind widened from
  "replies to your comments" to "new comments in chains you're part of"
  (`loadChainScope` in `digests.ts`: your comments ∪ their parents). The
  email already merges a chain's messages into one thread block
  (`renderThreadTree` merges by comment id), so a chain's activity batches
  into one notification for free. Followed-comments and mentions exclude
  the chain scope so nothing lands twice.

## Notes

- CommentActions lost its `?reply=` deep-link auto-open (tails own it now).
- `.thread-toggle` CSS removed with the per-chain folds; collapsing now
  happens only at teaser level.
- Stacked on PR #260 (comment-tree depth fix).
