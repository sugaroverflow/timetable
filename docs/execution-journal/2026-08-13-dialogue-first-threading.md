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

## Round 3 (same day): engagement-based comments-seen

Ed rejected the feed-wide watermark for teaser newness ("one feed visit
marks hundreds of topics read?"). New `comment_seen` table (migration
0035, per-(user, topic) `seenAt`, mirrors `topic_seen`): bumped ONLY on
engagement — teaser expand (incl. ?reply auto-open) or permalink visit
(`MarkCommentsSeen`) — never by loading a feed page. `markCommentsSeen`
mutation (self-scoped, any viewer who can load the topic);
`Topic.viewerCommentsSeenAt` rides the feed via a batch loader in
`buildFeed`. Teaser previews every new-since-engagement top-level comment,
padded to at least the three latest. Scroll-into-view tracking (Ed:
"ideal but can live without it") deliberately skipped.

## Round 4 (same day): digests ride comment_seen + click-to-read

- The four comment collectors (comments / replies / followed / mentions)
  now suppress against the per-topic `comment_seen` watermark instead of
  the blanket feed/notifications-page watermarks — only engaging with a
  discussion quiets its emails. `ctx.seenNotificationsAt` deleted;
  `seenFeedAt` survives for ❤️ cards only.
- **Click-to-read** (Ed: "if anything in the digest is clicked, that
  digest can be thought of as read and its contents seen"): new
  `digest_sends` table (migration 0036 — one row per sent digest email,
  storing which topics' cards showed comment threads; doubles as a send
  log). `stampDigestLinks` rides `dg=<send id>` on every app link (before
  the sign-in-ticket wrap, so it survives inside redirect_url);
  `DigestReadMarker` in the app layout watches every page for `?dg=`,
  fires `markDigestRead`, and strips the param. Marking bumps
  `comment_seen` to the SEND time via `GREATEST` (ISO-string cast, never
  a raw Date in a sql template — the Drizzle gotcha), so later in-app
  engagement is never regressed and comments newer than the email stay
  new. Send-time marking was considered and rejected — sent ≠ read.

## Notes

- CommentActions lost its `?reply=` deep-link auto-open (tails own it now).
- `.thread-toggle` CSS removed with the per-chain folds; collapsing now
  happens only at teaser level.
- Stacked on PR #260 (comment-tree depth fix).
