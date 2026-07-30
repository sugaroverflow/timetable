# Digest email v3 — per-topic activity cards

Ed (launch QA): stop splitting the digest into per-kind sections. Every
item should be an **"Author: Title"** topic card with that topic's
activity beneath it, aggregated when there's more than one. Plus: reply
links to the composer, full ancestor chains on replies, named hearters,
authors on every topic, and an actionable ordering.

## Data model (`packages/core/digests.ts`)

`ForumDigest` is now `{ …, topics: DigestTopicCard[] }`. Each card is one
topic (`topicId`, `title`, `author` = host, `path`) with an `activities`
list. `DigestActivity` is a discriminated union:

- **comment** — on your topic; carries `replyToCommentId` for the deep-link.
- **reply** — to your comment; carries the full **ancestor chain**
  (topic root → your comment) plus `replyToCommentId`.
- **heart** — every hearter **named** (Ed: no cap, individuals matter).
- **new** — a topic freshly published in an elector forum.
- **assignment** — a topic (re)assigned to you.
- **draft** — your own still-unpublished topic (standing reminder).

Ancestor chains are walked breadth-first up `parentId` (threads are
shallow) with author names resolved per forum. All the pre-existing
seen-watermark filtering is preserved (notifications watermark for
comments/replies, feed watermark for hearts, `topic_seen` for new topics).

## Ordering (Ed: your-content engagement first)

Cards are grouped by their most-actionable activity —
replies/comments/❤️s on your stuff (tier 0) → assignments (1) → new topics
(2) → drafts (3) — then by recency within a tier. Activities within a card
sort reply → comment → heart → assignment → new → draft. `isForumDigestEmpty`
is true when a forum has nothing but drafts.

## Render (`apps/api/email.ts`)

`renderDigest` emits one `Author: Title` heading per card followed by its
activities. Comments/replies get a `Reply →` link
(`{permalink}?reply={commentId}#comment-{commentId}` — the same anchor the
permalink page consumes). Replies show the ancestor chain as a dim quoted
block above the reply. Hearts list all names. `sampleDigest` (the "Send
test digest" button) now returns one card of every activity type in
display order, so admins preview the whole design. Everything user-authored
stays HTML-escaped (tested).
