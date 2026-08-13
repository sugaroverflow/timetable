"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import type { FeedComment } from "@/lib/feedTypes";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** True when the deep-linked comment lives in this tree — the teaser
 * auto-opens so ?reply= targets can render and focus their tail. */
function treeContains(comments: FeedComment[], id: string | null): boolean {
  if (!id) return false;
  return comments.some((c) => c.id === id || treeContains(c.replies ?? [], id));
}

/** One-line plain-text preview of a comment body. */
function snippet(body: string, max = 90): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** One new top-level comment's preview line: "name: comment (x replies)".
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
 * The comment-teaser (dialogue-first threading, round 2 2026-08-13): feed
 * and queue cards keep the top-composer always visible (the parent renders
 * it above); below it the teaser shows one preview line per NEW top-level
 * comment (vs the viewer's feed watermark) and a "💬 n comments" pill.
 * Clicking either reveals the whole tree in place — one-way; the pill and
 * previews disappear. The permalink page skips the teaser entirely.
 */
export function CommentTeaser({
  comments,
  lastSeenAt,
  children,
}: {
  comments: FeedComment[];
  /** The viewer's feed watermark — "new" means newer than this. */
  lastSeenAt: string | null;
  /** The full server-rendered CommentList. */
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() =>
    treeContains(comments, searchParams.get("reply")),
  );
  const total = countNested(comments);
  if (total === 0) return null;
  if (open) return <>{children}</>;

  const seen = lastSeenAt ? Date.parse(lastSeenAt) : null;
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
        <TeaserLine key={c.id} comment={c} onOpen={() => setOpen(true)} />
      ))}
      <button
        type="button"
        className="teaser-toggle"
        onClick={() => setOpen(true)}
      >
        💬 {total} {total === 1 ? "comment" : "comments"}
      </button>
    </div>
  );
}
