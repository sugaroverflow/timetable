"use client";

import { useState } from "react";

import type { FeedComment } from "@/lib/feedTypes";

import { Avatar } from "./Avatar";
import { CommentActions } from "./CommentActions";
import { PersonChip } from "./PersonChip";

const VISIBLE_TOP_LEVEL = 3;

function countNested(comments: FeedComment[]): number {
  return comments.reduce(
    (sum, c) => sum + 1 + countNested(c.replies ?? []),
    0,
  );
}

function CommentItem({
  comment,
  canReply,
  canModerate,
  slug,
}: {
  comment: FeedComment;
  canReply: boolean;
  canModerate: boolean;
  slug?: string;
}) {
  const replies = comment.replies ?? [];
  const [showReplies, setShowReplies] = useState(false);
  const replyCount = countNested(replies);

  return (
    <div
      id={`comment-${comment.id}`}
      className={`comment ${comment.hidden ? "hidden" : ""}`}
    >
      <Avatar name={comment.authorName} small />
      <div className="comment-main">
        <div className="c-bubble">
          <span className="c-name">
            {slug ? (
              <PersonChip slug={slug} userId={comment.authorId}>
                {comment.authorName ?? "Someone"}
              </PersonChip>
            ) : (
              (comment.authorName ?? "Someone")
            )}
          </span>
          {comment.visibility === "host_only" ? (
            <span className="pill pill-host" style={{ marginLeft: 6, fontSize: 10 }}>
              hosts
            </span>
          ) : null}
          {comment.hidden ? (
            <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
              hidden
            </span>
          ) : null}
          <div className="c-text">{comment.body}</div>
        </div>
        <CommentActions
          commentId={comment.id}
          canReply={canReply}
          canModerate={canModerate}
          hidden={comment.hidden}
        />
        {replies.length > 0 ? (
          showReplies ? (
            <div className="replies">
              {replies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  canReply={canReply}
                  canModerate={canModerate}
                  slug={slug}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="thread-toggle"
              onClick={() => setShowReplies(true)}
            >
              View {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

export function CommentList({
  comments,
  canReply,
  canModerate,
  slug,
}: {
  comments: FeedComment[];
  canReply: boolean;
  canModerate: boolean;
  slug?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!comments.length) return null;

  const visible =
    showAll || comments.length <= VISIBLE_TOP_LEVEL + 1
      ? comments
      : comments.slice(0, VISIBLE_TOP_LEVEL);
  const hiddenCount = comments.length - visible.length;

  return (
    <div className="comments">
      {visible.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          canReply={canReply}
          canModerate={canModerate}
          slug={slug}
        />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="thread-toggle"
          onClick={() => setShowAll(true)}
        >
          View all {comments.length} comments
        </button>
      ) : null}
    </div>
  );
}
