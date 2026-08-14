"use client";

import { useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";

import { countNested } from "@/lib/commentTree";
import type { FeedComment, HostHearter } from "@/lib/feedTypes";
import type { RoleLabels } from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { BreakdownCaret } from "./BreakdownPanel";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { FocusCommentButton } from "./FocusCommentButton";
import { HeartButton, HeartCount } from "./HeartButton";
import { PersonChip } from "./PersonChip";

/** The faculty actions row (host hearts, QA 2026-08-04): built from the
 * SAME pieces as the public card-actions row (HeartButton/HeartCount,
 * FocusCommentButton, BreakdownCaret) so the two rows can't drift —
 * [givers disclosure] [💙 + count] [💬 count] — INSIDE the host-only
 * thread, so who can see it is self-evident. The disclosure lists the 💙
 * givers; cross-topic tallies stay admin-only. */
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
          <HeartButton
            topicId={topicId}
            hearted={viewerHasHostHearted}
            count={hearters.length}
            kind="host"
          />
        ) : (
          <HeartCount count={hearters.length} kind="host" />
        )}
        <FocusCommentButton
          topicId={topicId}
          commentCount={commentCount}
          onClick={onFocusComposer}
        />
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

/** The host-only thread's body — 💙 actions row (when hearters are
 * provided), composer, thread. Shared by the collapsible panel below and
 * the My Topics card tabs (topic-card-tabs, 2026-08-14). */
export function HostOnlyThreadBody({
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
  canHostHeart?: boolean;
  viewerHasHostHearted?: boolean;
}) {
  const count = countNested(comments);
  const threadRef = useRef<HTMLDivElement>(null);
  return (
    <div className="host-thread thread-stack" ref={threadRef}>
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
      <CommentComposer
        topicId={topicId}
        visibility="host_only"
        hostLabel={hostLabel}
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
          <HostOnlyThreadBody
            topicId={topicId}
            comments={comments}
            canModerate={canModerate}
            viewerId={viewerId}
            slug={slug}
            hostLabel={hostLabel}
            roleLabels={roleLabels}
            hostHearters={hostHearters}
            canHostHeart={canHostHeart}
            viewerHasHostHearted={viewerHasHostHearted}
          />
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
