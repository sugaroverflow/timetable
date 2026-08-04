"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import { BreakdownCaret, BreakdownPanelBody } from "./BreakdownPanel";
import { FocusCommentButton } from "./FocusCommentButton";
import { HeartButton } from "./HeartButton";
import { HostHeartButton } from "./HostHeartButton";

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
  canHostHeart = false,
  viewerHasHostHearted = false,
  hostHeartAudience = "",
  signedIn,
  viewerHeartCount,
  electorLabel = "Elector",
}: {
  topicId: string;
  slug: string;
  heartCount: number;
  viewerHasHearted: boolean;
  commentCount: number;
  canHeart: boolean;
  /** Host-non-electors get the 💙 toggle next to the read-only ❤️ count
   * (host hearts, 2026-08-04). */
  canHostHeart?: boolean;
  viewerHasHostHearted?: boolean;
  /** Who sees the 💙 — honesty hint on the button's tooltip. */
  hostHeartAudience?: string;
  signedIn: boolean;
  viewerHeartCount: number | null;
  electorLabel?: string;
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
        {canHostHeart ? (
          <HostHeartButton
            topicId={topicId}
            hearted={viewerHasHostHearted}
            audience={hostHeartAudience}
          />
        ) : null}
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
          <BreakdownPanelBody
            slug={slug}
            topicId={topicId}
            electorLabel={electorLabel}
          />
        </div>
      ) : null}
    </>
  );
}
