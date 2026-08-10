# 2026-08-10 — Comments: pasted URLs become links, newlines render

Ed's QA (product feedback round 3): a URL pasted into a comment stayed
dead text. Topic bodies and bios already autolink (the server markdown
pipeline runs with `linkify: true`), but comments never touch that
pipeline — they are plain text end to end, rendered as React text nodes
by `CommentBody` (whose only affordance was @mention highlighting).

The fix stays inside the plain-text invariant rather than promoting
comments to markdown: no HTML is ever interpreted, links are built as
React elements.

- **`splitLinks` (`apps/web/src/lib/linkify.ts`)**: pure tokenizer
  splitting text into text/link segments. Matches `http(s)://` and bare
  `www.` (href gets an `https://` prefix), trims trailing sentence
  punctuation, and drops unbalanced closing brackets while keeping
  Wikipedia-style balanced parens. Unit-tested (10 cases) — emails and
  glued `foowww.` don't match.
- **`CommentBody`**: splits links first, then runs the existing mention
  regex on the text segments only — so `/@user` inside a URL can't read
  as a mention. Anchors get `target="_blank" rel="noopener noreferrer"`,
  matching what `renderMarkdown` stamps on topic-body links.
- **Slot chat**: `SlotDiscussion` rendered `{comment.body}` bare; it now
  uses `CommentBody`, picking up links and mention tokens.
- **`.c-text`**: gains `white-space: pre-wrap` (typed newlines finally
  render — bodies were always stored with them) and
  `overflow-wrap: anywhere` so a long pasted URL can't push the bubble
  out of its container.
