"use client";

import { useState } from "react";

import {
  BreakdownCaret,
  BreakdownPanelBody,
  DormantBreakdownBody,
} from "./BreakdownPanel";
import { FocusCommentButton } from "./FocusCommentButton";
import { HeartButton, HeartCount } from "./HeartButton";

/** The ❤️ + comments action row on a topic card, with the ❤️-breakdown
 * disclosure triangle to the left of the ❤️ button — visible to any
 * signed-in viewer (QA 2026-07-27; previously a host/admin-only panel at
 * the card's tail). The panel expands full-width under the row.
 *
 * `dormant` is my-topics-heart-row's retired-topic mode (2026-09-25): an
 * unpublished or archived topic keeps its ❤️s but counts them nowhere
 * until it is republished, so the row shows the count with no button, says
 * the ❤️s are paused, drops the 💬 (there is no composer to focus), and
 * its breakdown lists names without weights. */
export function TopicActionsRow({
  topicId,
  slug,
  heartCount,
  viewerHasHearted,
  commentCount,
  canHeart,
  signedIn,
  viewerHeartCount,
  electorLabel = "Elector",
  dormant = null,
}: {
  topicId: string;
  slug: string;
  heartCount: number;
  viewerHasHearted: boolean;
  commentCount: number;
  canHeart: boolean;
  signedIn: boolean;
  viewerHeartCount: number | null;
  electorLabel?: string;
  /** The retired topic's status label ("unpublished", "archived"), or null
   * for a live topic. */
  dormant?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="card-actions">
        {signedIn ? (
          <BreakdownCaret open={open} onToggle={() => setOpen(!open)} />
        ) : null}
        {canHeart && !dormant ? (
          <HeartButton
            topicId={topicId}
            hearted={viewerHasHearted}
            count={heartCount}
          />
        ) : (
          <HeartCount count={heartCount} />
        )}
        {dormant ? (
          <span
            className="faint"
            style={{ fontSize: 13 }}
            title="These ❤️s count again if the topic is republished"
          >
            paused while {dormant}
          </span>
        ) : (
          <FocusCommentButton topicId={topicId} commentCount={commentCount} />
        )}
        <span style={{ flex: 1 }} />
        {!dormant && viewerHasHearted && viewerHeartCount ? (
          <span className="weight-chip" title="Your current vote weight">
            your vote: 1/{viewerHeartCount}
          </span>
        ) : null}
      </div>
      {open ? (
        <div className="host-panel">
          {dormant ? (
            <DormantBreakdownBody
              slug={slug}
              topicId={topicId}
              electorLabel={electorLabel}
            />
          ) : (
            <BreakdownPanelBody
              slug={slug}
              topicId={topicId}
              electorLabel={electorLabel}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
