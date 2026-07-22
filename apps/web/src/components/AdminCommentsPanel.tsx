"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Shield } from "lucide-react";

import type { FeedComment } from "@/lib/feedTypes";

import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
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
    <Collapsible.Root
      className="host-panel admin-panel"
      open={expanded}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger className="host-panel-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        {expanded ? (
          `Hide ${adminLabel} comments`
        ) : (
          <>
            <Shield size={14} aria-hidden /> {adminLabel} comments ({count})
          </>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel>
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
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
