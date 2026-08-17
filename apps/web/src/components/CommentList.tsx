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
      {comment.pinnedAt ? (
        <span
          style={{ marginLeft: 6, fontSize: 11 }}
          title="Pinned by the topic's author"
        >
          📌
        </span>
      ) : null}
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
  canPin = false,
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
  /** The viewer authored the topic: Pin/Unpin on top-level comments
   * (#258). */
  canPin?: boolean;
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
            // Pin = the topic author's curation gesture, roots only (#258).
            canPin={canPin && depth === 1}
            pinned={comment.pinnedAt != null}
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
/** Pinned-first thread order (#258). The server keeps roots newest-first
 * (teasers and digests read "latest" off that order), so pinning is purely
 * a render-time re-sort: pins on top (earliest pin first — the author
 * curates by pinning sequence), then everyone else newest-first. The one
 * exception (Ed's spec, 2026-08-17): a comment that arrived AFTER this
 * list mounted stays ABOVE the pins until the next full page load —
 * whoever just posted it did so at the top-composer, and watching it drop
 * below the pins would read as the comment disappearing. */
function orderRoots(
  comments: FeedComment[],
  initialIds: Set<string>,
): FeedComment[] {
  const pinned = comments.filter((c) => c.pinnedAt);
  if (pinned.length === 0) return comments;
  pinned.sort((a, b) => Date.parse(a.pinnedAt!) - Date.parse(b.pinnedAt!));
  const fresh = comments.filter((c) => !c.pinnedAt && !initialIds.has(c.id));
  const rest = comments.filter((c) => !c.pinnedAt && initialIds.has(c.id));
  return [...fresh, ...pinned, ...rest];
}

export function CommentList({
  comments,
  canReply,
  canModerate,
  viewerId = null,
  slug,
  roleLabels,
  topicHref,
  topicHostId = null,
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
  /** The topic's owner — a viewer who matches gets Pin/Unpin on top-level
   * comments (#258). Omit on threads where pinning shouldn't offer. */
  topicHostId?: string | null;
}) {
  // Snapshot of the roots present at mount, for the fresh-above-pins rule.
  const [initialIds] = useState(() => new Set(comments.map((c) => c.id)));
  if (!comments.length) return null;
  const canPin = viewerId != null && viewerId === topicHostId;

  return (
    <div className="comments">
      {orderRoots(comments, initialIds).map((c) => (
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
          canPin={canPin}
        />
      ))}
    </div>
  );
}
