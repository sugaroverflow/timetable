"use client";

import { useState } from "react";

import type { FeedComment } from "@/lib/feedTypes";

import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";

function countNested(comments: FeedComment[]): number {
  return comments.reduce(
    (sum, c) => sum + 1 + countNested(c.replies ?? []),
    0,
  );
}

/** The drafting thread (QA #59 round 3): "{Admin} comments", visible to
 * admins (on Pending Topics) and the topic owner (on My Topics) only —
 * never in the feed. Threaded, with its own composer. Starts expanded when
 * the thread already has comments so feedback is never missed. */
export function AdminCommentsPanel({
  topicId,
  comments,
  canModerate,
  slug,
  adminLabel = "Admin",
}: {
  topicId: string;
  comments: FeedComment[];
  canModerate: boolean;
  slug?: string;
  adminLabel?: string;
}) {
  const count = countNested(comments);
  const [expanded, setExpanded] = useState(count > 0);

  return (
    <div className="host-panel admin-panel">
      <button
        className="host-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded
          ? `Hide ${adminLabel} comments ▾`
          : `🛡 ${adminLabel} comments (${count}) ▸`}
      </button>
      {expanded && (
        <div className="host-thread">
          <CommentList
            comments={comments}
            canReply={true}
            canModerate={canModerate}
            slug={slug}
          />
          <CommentComposer
            topicId={topicId}
            visibility="admin_only"
            adminLabel={adminLabel}
          />
        </div>
      )}
    </div>
  );
}
