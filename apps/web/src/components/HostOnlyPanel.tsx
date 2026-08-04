"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";

import type { FeedComment, HostHearter } from "@/lib/feedTypes";
import type { RoleLabels } from "@/lib/timetableSettings";

import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { PersonChip } from "./PersonChip";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** The attributed "💙 Sarah, Amir" row (host hearts, 2026-08-04) —
 * everyone who can open this panel sees who 💙'd; counts across topics
 * stay admin-only in Analysis. */
function HostHeartsRow({
  hearters,
  slug,
  hostLabel,
}: {
  hearters: HostHearter[];
  slug?: string;
  hostLabel: string;
}) {
  if (hearters.length === 0) return null;
  return (
    <div className="faint host-hearts-row">
      <span aria-hidden>💙</span>{" "}
      {hearters.map((h, i) => (
        <span key={h.userId}>
          {i > 0 ? ", " : ""}
          {slug ? (
            <PersonChip slug={slug} userId={h.userId}>
              {h.name ?? hostLabel}
            </PersonChip>
          ) : (
            (h.name ?? hostLabel)
          )}
        </span>
      ))}
    </div>
  );
}

/** Collapsible host-only comment thread with its own composer — separate
 * from the vote-breakdown panel (QA #42). Rendered only for hosts/admins. */
export function HostOnlyPanel({
  topicId,
  comments,
  canModerate,
  viewerId = null,
  slug,
  hostLabel = "Host",
  roleLabels,
  hostHearters = null,
}: {
  topicId: string;
  comments: FeedComment[];
  canModerate: boolean;
  viewerId?: string | null;
  slug?: string;
  hostLabel?: string;
  roleLabels?: RoleLabels;
  hostHearters?: HostHearter[] | null;
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
            {hostHearters && hostHearters.length > 0 ? (
              <> · 💙 {hostHearters.length}</>
            ) : null}
          </>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {expanded && (
          <div className="host-thread">
            {hostHearters ? (
              <HostHeartsRow
                hearters={hostHearters}
                slug={slug}
                hostLabel={hostLabel}
              />
            ) : null}
            <CommentList
              comments={comments}
              canReply={true}
              canModerate={canModerate}
              viewerId={viewerId}
              slug={slug}
              roleLabels={roleLabels}
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
