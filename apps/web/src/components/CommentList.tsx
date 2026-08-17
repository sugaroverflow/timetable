"use client";

import Link from "next/link";
import { useState } from "react";

import type { FeedComment } from "@/lib/feedTypes";
import { COMMENT_TREE_DEPTH } from "@/lib/gqlFragments";
import { relativeTime } from "@/lib/relativeTime";
import type { RoleLabels } from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { ChainTailComposer } from "./ChainTailComposer";
import { CommentActions } from "./CommentActions";
import { CommentBody } from "./CommentBody";
import { CommentEditForm } from "./CommentEditForm";
import { PersonChip } from "./PersonChip";
import { PrimaryRolePill } from "./RolePills";

/** Restricted-visibility badge next to the author name. */
const VISIBILITY_PILLS: Record<string, { className: string; label: string }> = {
  host_only: { className: "pill pill-host", label: "hosts" },
  admin_only: { className: "pill pill-admin", label: "admins" },
};

/** Faint relative timestamp on every comment — a permalink to the
 * comment's anchor on the topic page when the thread knows its topic's URL
 * (#259). The `#comment-<id>` anchors carry scroll-margin past the topbar
 * and a :target highlight ring (activity-log overhaul, 2026-08-17), so the
 * link lands the reader right on the comment. */
function CommentTime({
  comment,
  topicHref,
}: {
  comment: FeedComment;
  topicHref?: string | null;
}) {
  // Server and client render moments differ, so both the relative label
  // and the timezone-dependent title can mismatch at hydration — harmless,
  // suppressed.
  const label = relativeTime(comment.createdAt);
  const exact = new Date(comment.createdAt).toLocaleString("en-GB");
  if (!topicHref) {
    return (
      <span className="c-time" title={exact} suppressHydrationWarning>
        {label}
      </span>
    );
  }
  return (
    <Link
      className="c-time"
      href={`${topicHref}#comment-${comment.id}`}
      title={exact}
      suppressHydrationWarning
    >
      {label}
    </Link>
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
  topicHref,
}: {
  comment: FeedComment;
  slug?: string;
  roleLabels?: RoleLabels;
  editing: boolean;
  onEditDone(): void;
  topicHref?: string | null;
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
      <CommentTime comment={comment} topicHref={topicHref} />
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

/** A comment's chain: its children as a linear dialogue (oldest first),
 * ending in the chain-tail-composer. New messages attach to the PARENT
 * comment (root-attach), so chains don't deepen; the tail only exists
 * where the reply-depth-guard allows the next message to be fetched. */
function ChainBlock({
  comment,
  replies,
  canReply,
  canModerate,
  viewerId,
  slug,
  roleLabels,
  depth,
  topicHref,
}: {
  comment: FeedComment;
  replies: FeedComment[];
  canReply: boolean;
  canModerate: boolean;
  viewerId: string | null;
  slug?: string;
  roleLabels?: RoleLabels;
  depth: number;
  topicHref?: string | null;
}) {
  // Chain parents: every top-level comment, and any forked comment whose
  // sub-chain has started.
  const showTail =
    canReply &&
    (depth === 1 || replies.length > 0) &&
    depth < COMMENT_TREE_DEPTH;
  if (replies.length === 0 && !showTail) return null;
  // ?reply= deep links (digest emails) land on the chain's tail: the chain
  // parent's own id, plus its childless messages (a message with a
  // sub-chain is answered by its own tail instead).
  const tailFocusIds = [
    comment.id,
    ...replies.filter((r) => (r.replies ?? []).length === 0).map((r) => r.id),
  ];
  return (
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
          topicHref={topicHref}
        />
      ))}
      {showTail ? (
        <ChainTailComposer parentId={comment.id} focusIds={tailFocusIds} />
      ) : null}
    </div>
  );
}

/**
 * Dialogue-first threading (2026-08-13): a comment's children render as a
 * linear chain (oldest first) ending in a chain-tail-composer that
 * continues the dialogue — new messages attach to THIS comment
 * (root-attach), so chains don't deepen. Reply on a chain message is the
 * rarer fork gesture, opening a sub-chain beside the main line.
 */
function CommentItem({
  comment,
  canReply,
  canModerate,
  viewerId,
  slug,
  roleLabels,
  depth,
  topicHref,
}: {
  comment: FeedComment;
  canReply: boolean;
  canModerate: boolean;
  viewerId: string | null;
  slug?: string;
  roleLabels?: RoleLabels;
  /** 1-based nesting level, counted from the thread roots. */
  depth: number;
  topicHref?: string | null;
}) {
  const replies = comment.replies ?? [];
  const [editing, setEditing] = useState(false);
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
            topicHref={topicHref}
          />
        )}
        {comment.deleted ? null : (
          <CommentActions
            commentId={comment.id}
            // Reply = fork a sub-chain off a chain message; top-level
            // comments continue through their tail composer instead.
            canReply={canReply && depth >= 2 && depth < COMMENT_TREE_DEPTH}
            canModerate={canModerate}
            hidden={comment.hidden}
            isOwn={isOwn}
            onEdit={() => setEditing(true)}
          />
        )}
        <ChainBlock
          comment={comment}
          replies={replies}
          canReply={canReply}
          canModerate={canModerate}
          viewerId={viewerId}
          slug={slug}
          roleLabels={roleLabels}
          depth={depth}
          topicHref={topicHref}
        />
      </div>
    </div>
  );
}

/** The full thread, always open — newest chain first (the server orders
 * roots newest-first to match the top-composer above the stack); feed
 * surfaces collapse the whole section behind CommentTeaser instead of
 * folding here. */
export function CommentList({
  comments,
  canReply,
  canModerate,
  viewerId = null,
  slug,
  roleLabels,
  topicHref,
}: {
  comments: FeedComment[];
  canReply: boolean;
  canModerate: boolean;
  /** Enables Edit/Delete on the viewer's own comments (QA 2026-07-29). */
  viewerId?: string | null;
  slug?: string;
  /** The forum's role labels, for the author role pills. */
  roleLabels?: RoleLabels;
  /** The topic page's path — turns each comment's timestamp into a
   * permalink to its anchor there (#259); plain text when absent. */
  topicHref?: string | null;
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
          viewerId={viewerId}
          slug={slug}
          roleLabels={roleLabels}
          depth={1}
          topicHref={topicHref}
        />
      ))}
    </div>
  );
}
