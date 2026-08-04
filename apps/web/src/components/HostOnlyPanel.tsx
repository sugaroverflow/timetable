"use client";

import { useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Lock, MessageCircle } from "lucide-react";

import type { FeedComment, HostHearter } from "@/lib/feedTypes";
import type { RoleLabels } from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { BreakdownCaret } from "./BreakdownPanel";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { HostHeartButton } from "./HostHeartButton";
import { PersonChip } from "./PersonChip";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** The faculty actions row (host hearts, QA 2026-08-04): mirrors the
 * public card-actions row — [givers disclosure] [💙 + count] [💬 count] —
 * INSIDE the host-only thread, so who can see it is self-evident. The
 * disclosure lists the 💙 givers; cross-topic tallies stay admin-only. */
function HostHeartsActionsRow({
  topicId,
  hearters,
  canHostHeart,
  viewerHasHostHearted,
  commentCount,
  slug,
  hostLabel,
  onFocusComposer,
}: {
  topicId: string;
  hearters: HostHearter[];
  canHostHeart: boolean;
  viewerHasHostHearted: boolean;
  commentCount: number;
  slug?: string;
  hostLabel: string;
  onFocusComposer: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card-actions">
        {hearters.length > 0 ? (
          <BreakdownCaret
            open={open}
            onToggle={() => setOpen(!open)}
            label="💙 list"
          />
        ) : null}
        {canHostHeart ? (
          <HostHeartButton
            topicId={topicId}
            hearted={viewerHasHostHearted}
            count={hearters.length}
          />
        ) : (
          // Read-only count (admins, dual-role hosts, the topic's owner on
          // My Topics): 🤍 at zero so an empty box doesn't read as hearted.
          <span className="heart-btn" aria-hidden>
            <span className="ic">{hearters.length > 0 ? "💙" : "🤍"}</span>
            {hearters.length}
          </span>
        )}
        <button className="act" type="button" onClick={onFocusComposer}>
          <MessageCircle size={16} aria-hidden />
          {commentCount || ""}
          <span style={{ fontWeight: "var(--fw-semibold)" }}>Comment</span>
        </button>
      </div>
      {open ? (
        <div className="host-hearts-list stack" style={{ gap: 6 }}>
          {hearters.map((h) => (
            <span
              key={h.userId}
              className="row"
              style={{ gap: 6, alignItems: "center" }}
            >
              <span aria-hidden>💙</span>
              {slug ? (
                <PersonChip slug={slug} userId={h.userId}>
                  <Avatar small name={h.name} image={h.image} />{" "}
                  {h.name ?? hostLabel}
                </PersonChip>
              ) : (
                (h.name ?? hostLabel)
              )}
            </span>
          ))}
        </div>
      ) : null}
    </>
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
  const threadRef = useRef<HTMLDivElement>(null);

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
          <div className="host-thread host-thread-actions" ref={threadRef}>
            {hostHearters ? (
              <HostHeartsActionsRow
                topicId={topicId}
                hearters={hostHearters}
                canHostHeart={canHostHeart}
                viewerHasHostHearted={viewerHasHostHearted}
                commentCount={count}
                slug={slug}
                hostLabel={hostLabel}
                onFocusComposer={() =>
                  threadRef.current?.querySelector("textarea")?.focus()
                }
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
