"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";

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
  slug,
  hostLabel = "Host",
}: {
  topicId: string;
  comments: FeedComment[];
  canModerate: boolean;
  slug?: string;
  hostLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = countNested(comments);

  return (
    <Collapsible.Root
      className="host-panel"
      open={expanded}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger className="host-panel-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        {expanded ? (
          `Hide ${hostLabel}-only comments`
        ) : (
          <>
            <Lock size={14} aria-hidden /> {hostLabel}-only comments ({count})
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
              visibility="host_only"
              hostLabel={hostLabel}
            />
          </div>
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
