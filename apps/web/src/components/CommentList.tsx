"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { FeedComment } from "@/lib/feedTypes";
import { COMMENT_TREE_DEPTH } from "@/lib/gqlFragments";
import type { RoleLabels } from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { CommentActions } from "./CommentActions";
import { CommentBody } from "./CommentBody";
import { CommentEditForm } from "./CommentEditForm";
import { PersonChip } from "./PersonChip";
import { PrimaryRolePill } from "./RolePills";

const VISIBLE_TOP_LEVEL = 3;

/** Restricted-visibility badge next to the author name. */
const VISIBILITY_PILLS: Record<string, { className: string; label: string }> = {
  host_only: { className: "pill pill-host", label: "hosts" },
  admin_only: { className: "pill pill-admin", label: "admins" },
};

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** True when the deep-linked comment lives in this subtree — collapsed
 * threads auto-expand so ?reply= targets are visible (QA #59 round 3). */
function subtreeContains(comments: FeedComment[], id: string | null): boolean {
  if (!id) return false;
  return comments.some(
    (c) => c.id === id || subtreeContains(c.replies ?? [], id),
  );
}

/** The name row + body for a live (non-deleted) comment; the body swaps
 * for the inline editor while editing (edit-in-place, QA 2026-07-29). */
function CommentBubble({
  comment,
  slug,
  roleLabels,
  editing,
  onEditDone,
}: {
  comment: FeedComment;
  slug?: string;
  roleLabels?: RoleLabels;
  editing: boolean;
  onEditDone(): void;
}) {
  const visibilityPill = VISIBILITY_PILLS[comment.visibility];
  return (
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
      {/* Who's talking, at a glance: the author's role in this forum
          (mixed host/elector threads read ambiguously without it). */}
      <PrimaryRolePill roles={comment.authorRoles} labels={roleLabels} />
      {visibilityPill ? (
        <span
          className={visibilityPill.className}
          style={{ marginLeft: 6, fontSize: 10 }}
        >
          {visibilityPill.label}
        </span>
      ) : null}
      {comment.hidden ? (
        <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
          hidden
        </span>
      ) : null}
      {comment.editedAt && !editing ? (
        <span
          className="faint"
          style={{ marginLeft: 6, fontSize: 11 }}
          title={new Date(comment.editedAt).toLocaleString()}
        >
          (edited)
        </span>
      ) : null}
      <div className="c-text">
        {editing ? (
          <CommentEditForm
            commentId={comment.id}
            initialBody={comment.body}
            onDone={onEditDone}
          />
        ) : (
          <CommentBody body={comment.body} />
        )}
      </div>
    </div>
  );
}

/** The comment's author avatar — clicks through to the author's page like
 * the name (mobile+links pass 2026-08-03); tombstones have no author. */
function CommentAvatar({
  comment,
  slug,
}: {
  comment: FeedComment;
  slug?: string;
}) {
  if (slug && !comment.deleted) {
    return (
      <PersonChip slug={slug} userId={comment.authorId}>
        <Avatar name={comment.authorName} image={comment.authorImage} small />
      </PersonChip>
    );
  }
  return (
    <Avatar
      name={comment.deleted ? null : comment.authorName}
      image={comment.authorImage}
      small
    />
  );
}

function CommentItem({
  comment,
  canReply,
  canModerate,
  viewerId,
  slug,
  roleLabels,
  depth,
}: {
  comment: FeedComment;
  canReply: boolean;
  canModerate: boolean;
  viewerId: string | null;
  slug?: string;
  roleLabels?: RoleLabels;
  /** 1-based nesting level, counted from the thread roots. */
  depth: number;
}) {
  const replies = comment.replies ?? [];
  const searchParams = useSearchParams();
  const [showReplies, setShowReplies] = useState(() =>
    subtreeContains(replies, searchParams.get("reply")),
  );
  const [editing, setEditing] = useState(false);
  const replyCount = countNested(replies);
  const isOwn = viewerId != null && viewerId === comment.authorId;

  return (
    <div
      id={`comment-${comment.id}`}
      className={`comment ${comment.hidden ? "hidden" : ""}`}
    >
      <CommentAvatar comment={comment} slug={slug} />
      <div className="comment-main">
        {comment.deleted ? (
          // Author-deleted tombstone: only present at all because replies
          // hang off it (childless deletions are pruned server-side).
          <div className="c-bubble">
            <span className="c-text faint" style={{ fontStyle: "italic" }}>
              This comment was deleted by its author.
            </span>
          </div>
        ) : (
          <CommentBubble
            comment={comment}
            slug={slug}
            roleLabels={roleLabels}
            editing={editing}
            onEditDone={() => setEditing(false)}
          />
        )}
        {comment.deleted ? null : (
          <CommentActions
            commentId={comment.id}
            // reply-depth-guard: queries fetch COMMENT_TREE_DEPTH levels, so
            // a reply below the deepest one would save but never render —
            // don't offer it (deep-thread QA, 2026-08-12).
            canReply={canReply && depth < COMMENT_TREE_DEPTH}
            canModerate={canModerate}
            hidden={comment.hidden}
            isOwn={isOwn}
            onEdit={() => setEditing(true)}
          />
        )}
        {replies.length > 0 ? (
          showReplies ? (
            <div className="replies">
              {replies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  canReply={canReply}
                  canModerate={canModerate}
                  viewerId={viewerId}
                  slug={slug}
                  roleLabels={roleLabels}
                  depth={depth + 1}
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
  viewerId = null,
  slug,
  roleLabels,
}: {
  comments: FeedComment[];
  canReply: boolean;
  canModerate: boolean;
  /** Enables Edit/Delete on the viewer's own comments (QA 2026-07-29). */
  viewerId?: string | null;
  slug?: string;
  /** The forum's role labels, for the author role pills. */
  roleLabels?: RoleLabels;
}) {
  const searchParams = useSearchParams();
  const [showAll, setShowAll] = useState(() =>
    subtreeContains(
      comments.slice(VISIBLE_TOP_LEVEL),
      searchParams.get("reply"),
    ),
  );
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
          viewerId={viewerId}
          slug={slug}
          roleLabels={roleLabels}
          depth={1}
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
