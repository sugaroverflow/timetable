import type { FeedComment } from "@/lib/feedTypes";

import { Avatar } from "./Avatar";
import { CommentActions } from "./CommentActions";

function CommentItem({
  comment,
  canReply,
  canModerate,
}: {
  comment: FeedComment;
  canReply: boolean;
  canModerate: boolean;
}) {
  const replies = comment.replies ?? [];
  return (
    <div className={`comment ${comment.hidden ? "hidden" : ""}`}>
      <Avatar name={comment.authorName} small />
      <div className="comment-main">
        <div className="comment-meta">
          <span className="who">{comment.authorName ?? "Someone"}</span>
          {comment.visibility === "host_only" ? (
            <span className="pill pill-host" style={{ marginLeft: 6 }}>
              hosts
            </span>
          ) : null}
          {comment.hidden ? (
            <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
              hidden
            </span>
          ) : null}
        </div>
        <div className="comment-body">{comment.body}</div>
        <CommentActions
          commentId={comment.id}
          canReply={canReply}
          canModerate={canModerate}
          hidden={comment.hidden}
        />
        {replies.length > 0 ? (
          <div className="replies">
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                canReply={canReply}
                canModerate={canModerate}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CommentList({
  comments,
  canReply,
  canModerate,
}: {
  comments: FeedComment[];
  canReply: boolean;
  canModerate: boolean;
}) {
  if (!comments.length) return null;
  return (
    <div className="comments">
      {comments.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          canReply={canReply}
          canModerate={canModerate}
        />
      ))}
    </div>
  );
}
