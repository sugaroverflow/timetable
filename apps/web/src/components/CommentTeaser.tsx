"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { countNested, treeContains } from "@/lib/commentTree";
import { markCommentsSeen } from "@/lib/commentsSeen";
import type { FeedComment } from "@/lib/feedTypes";

import { useCommentsOpen } from "./CommentsOpenScope";

/** One-line plain-text preview of a comment body. */
function snippet(body: string, max = 90): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** One top-level comment's preview line: "name: comment (x replies)".
 * Clicking it opens the tree, like the pill. */
function TeaserLine({
  comment,
  onOpen,
}: {
  comment: FeedComment;
  onOpen(): void;
}) {
  const replyCount = countNested(comment.replies ?? []);
  return (
    <button type="button" className="teaser-snippet" onClick={onOpen}>
      <strong>{comment.authorName ?? "Someone"}</strong>:{" "}
      {snippet(comment.body)}
      {replyCount > 0 ? (
        <span className="faint">
          {" "}
          ({replyCount} {replyCount === 1 ? "reply" : "replies"})
        </span>
      ) : null}
    </button>
  );
}

/**
 * The comment-teaser (dialogue-first threading, rounds 2–3 2026-08-13):
 * feed and queue cards keep the top-composer always visible (the parent
 * renders it above); below it the teaser previews every top-level comment
 * that is new since the viewer last ENGAGED with this discussion — padded
 * to at least the three latest — plus a "💬 n comments" pill. Clicking
 * either reveals the whole tree in place (one-way) and bumps the viewer's
 * per-topic comments-seen watermark; merely scrolling the feed never
 * marks anything seen.
 */
export function CommentTeaser({
  topicId,
  comments,
  seenAt,
  children,
}: {
  topicId: string;
  comments: FeedComment[];
  /** The viewer's comments-seen watermark for THIS topic — null when
   * they never engaged (previews then fall back to the three latest). */
  seenAt: string | null;
  /** The full server-rendered CommentList. */
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  // A ?reply= deep link into this tree auto-opens — engagement too.
  const [open, setOpen] = useState(() =>
    treeContains(comments, searchParams.get("reply")),
  );
  // The card's 💬 button and top-composer open the tree; the Comments tab
  // button flips it (comments-open-scope). Render-phase adjustment — the
  // React "information from previous renders" pattern, as in TopicTabs.
  const { requestId, toggleId } = useCommentsOpen();
  const [seenRequest, setSeenRequest] = useState(requestId);
  const [seenToggle, setSeenToggle] = useState(toggleId);
  if (requestId !== seenRequest) {
    setSeenRequest(requestId);
    setOpen(true);
  }
  if (toggleId !== seenToggle) {
    setSeenToggle(toggleId);
    setOpen((o) => !o);
  }
  // Opening (click, deep link, 💬, or posting) is the engagement signal —
  // mark once. Folding it back again doesn't un-see what you read.
  const marked = useRef(false);
  useEffect(() => {
    if (!open || marked.current) return;
    marked.current = true;
    markCommentsSeen(topicId);
  }, [open, topicId]);
  const total = countNested(comments);
  if (total === 0) return null;
  if (open) return <>{children}</>;

  const openTree = () => setOpen(true);

  const seen = seenAt ? Date.parse(seenAt) : null;
  const roots = comments.filter((c) => !c.deleted);
  const freshCount =
    seen == null
      ? 0
      : roots.filter((c) => Date.parse(c.createdAt) > seen).length;
  // Every new top-level comment previews, padded to at least the three
  // latest (roots arrive newest-first, so new roots are the prefix and
  // padding is just a wider slice).
  const preview = roots.slice(0, Math.max(freshCount, 3));

  return (
    <div className="comment-teaser">
      {preview.map((c) => (
        <TeaserLine key={c.id} comment={c} onOpen={openTree} />
      ))}
      <button type="button" className="teaser-toggle" onClick={openTree}>
        💬 {total} {total === 1 ? "comment" : "comments"}
      </button>
    </div>
  );
}
