"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import { BreakdownCaret, BreakdownPanelBody } from "./BreakdownPanel";
import { FocusCommentButton } from "./FocusCommentButton";
import { HeartButton } from "./HeartButton";

/** The ❤️ + comments action row on a topic card, with the ❤️-breakdown
 * disclosure triangle to the left of the ❤️ button — visible to any
 * signed-in viewer (QA 2026-07-27; previously a host/admin-only panel at
 * the card's tail). The panel expands full-width under the row. */
export function TopicActionsRow({
  topicId,
  slug,
  heartCount,
  viewerHasHearted,
  commentCount,
  canHeart,
  signedIn,
  viewerHeartCount,
}: {
  topicId: string;
  slug: string;
  heartCount: number;
  viewerHasHearted: boolean;
  commentCount: number;
  canHeart: boolean;
  signedIn: boolean;
  viewerHeartCount: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="card-actions">
        {signedIn ? (
          <BreakdownCaret open={open} onToggle={() => setOpen(!open)} />
        ) : null}
        {canHeart ? (
          <HeartButton
            topicId={topicId}
            hearted={viewerHasHearted}
            count={heartCount}
          />
        ) : (
          <span className="heart-btn" aria-hidden>
            <span className="ic">
              <Heart size={16} fill="currentColor" />
            </span>
            {heartCount}
          </span>
        )}
        <FocusCommentButton topicId={topicId} commentCount={commentCount} />
        <span style={{ flex: 1 }} />
        {viewerHasHearted && viewerHeartCount ? (
          <span className="weight-chip" title="Your current vote weight">
            your vote: 1/{viewerHeartCount}
          </span>
        ) : null}
      </div>
      {open ? (
        <div className="host-panel">
          <BreakdownPanelBody slug={slug} topicId={topicId} />
        </div>
      ) : null}
    </>
  );
}
