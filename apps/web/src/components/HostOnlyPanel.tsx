"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";

import type { FeedComment, HostHearter } from "@/lib/feedTypes";
import type { RoleLabels } from "@/lib/timetableSettings";

import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { HostHeartButton } from "./HostHeartButton";
import { PersonChip } from "./PersonChip";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** The 💙 row (host hearts, 2026-08-04): the viewer's own toggle (when
 * they're an eligible host-non-elector) plus the attributed "💙 Sarah,
 * Amir" names — INSIDE the host-only thread, so who can see it is
 * self-evident. Counts across topics stay admin-only in Analysis. */
function HostHeartsRow({
  topicId,
  hearters,
  canHostHeart,
  viewerHasHostHearted,
  slug,
  hostLabel,
}: {
  topicId: string;
  hearters: HostHearter[];
  canHostHeart: boolean;
  viewerHasHostHearted: boolean;
  slug?: string;
  hostLabel: string;
}) {
  if (!canHostHeart && hearters.length === 0) return null;
  return (
    <div className="row host-hearts-row" style={{ alignItems: "center" }}>
      {canHostHeart ? (
        <HostHeartButton topicId={topicId} hearted={viewerHasHostHearted} />
      ) : null}
      <span className="faint">
        {hearters.length === 0 ? (
          <>No 💙 yet</>
        ) : (
          <>
            {canHostHeart ? null : <span aria-hidden>💙 </span>}
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
          </>
        )}
      </span>
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
  canHostHeart = false,
  viewerHasHostHearted = false,
}: {
  topicId: string;
  comments: FeedComment[];
  canModerate: boolean;
  viewerId?: string | null;
  slug?: string;
  hostLabel?: string;
  roleLabels?: RoleLabels;
  hostHearters?: HostHearter[] | null;
  /** Eligible host-non-elector viewer — gets the 💙 toggle in the row. */
  canHostHeart?: boolean;
  viewerHasHostHearted?: boolean;
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
                topicId={topicId}
                hearters={hostHearters}
                canHostHeart={canHostHeart}
                viewerHasHostHearted={viewerHasHostHearted}
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
