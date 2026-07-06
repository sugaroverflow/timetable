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

/** Collapsible host-only comment thread with its own composer — separate
 * from the vote-breakdown panel (QA #42). Rendered only for hosts/admins. */
export function HostOnlyPanel({
  topicId,
  comments,
  canModerate,
}: {
  topicId: string;
  comments: FeedComment[];
  canModerate: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = countNested(comments);

  return (
    <div className="host-panel">
      <button
        className="host-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded
          ? "Hide host-only comments ▾"
          : `🔒 Host-only comments (${count}) ▸`}
      </button>
      {expanded && (
        <div className="host-thread">
          <CommentList
            comments={comments}
            canReply={true}
            canModerate={canModerate}
          />
          <CommentComposer topicId={topicId} visibility="host_only" />
        </div>
      )}
    </div>
  );
}
