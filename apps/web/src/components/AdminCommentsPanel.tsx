"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Shield } from "lucide-react";

import type { FeedComment } from "@/lib/feedTypes";
import { pluralLabel, type RoleLabels } from "@/lib/timetableSettings";

import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** The drafting thread (QA #59 round 3), visible to admins (on Pending
 * Topics) and the topic owner (on My Topics) only — never in the feed.
 * Threaded, with its own composer. Starts expanded when the thread already
 * has comments so feedback is never missed. Copy says "you and {Admins}
 * only" for every viewer (Ed, 2026-08-11 — "the {Host} and {Admins}" read
 * as the whole faculty); admins get the owner named in the hint so nobody
 * assumes the thread is admin-private (QA 2026-07-29). */
export function AdminCommentsPanel({
  topicId,
  comments,
  canModerate,
  viewerId = null,
  slug,
  adminLabel = "Admin",
  hostLabel = "Host",
  roleLabels,
}: {
  topicId: string;
  comments: FeedComment[];
  canModerate: boolean;
  viewerId?: string | null;
  slug?: string;
  adminLabel?: string;
  hostLabel?: string;
  roleLabels?: RoleLabels;
}) {
  const count = countNested(comments);
  const [expanded, setExpanded] = useState(count > 0);
  const admins = pluralLabel(adminLabel);
  const audience = `you and ${admins} only`;
  const composerHint = canModerate
    ? `only the ${hostLabel} and ${admins} can see this`
    : `only you and ${admins} can see this`;

  return (
    <Collapsible.Root
      className="host-panel admin-panel"
      open={expanded}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger className="host-panel-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        {expanded ? (
          "Hide comments"
        ) : (
          <>
            <Shield size={14} aria-hidden /> Comments ({audience})
            {count > 0 ? ` (${count})` : ""}
          </>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {expanded && (
          <div className="host-thread thread-stack">
            <CommentComposer
              topicId={topicId}
              visibility="admin_only"
              adminLabel={adminLabel}
              placeholder={`Add a comment… (${composerHint})`}
              successMessage="Comment added"
            />
            <CommentList
              comments={comments}
              canReply={true}
              canModerate={canModerate}
              viewerId={viewerId}
              slug={slug}
              roleLabels={roleLabels}
            />
          </div>
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
