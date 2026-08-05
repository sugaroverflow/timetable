"use client";

import { Heart } from "lucide-react";
import { useRef } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

/** The two gestures share one button (spacing/structure refactor,
 * 2026-08-05): electors' ❤️ on the public actions row, and host 💙s
 * (host hearts, 2026-08-04) inside the host-only thread — one person,
 * one gesture, one component so the two rows can't drift apart. */
type HeartKind = "elector" | "host";

const MUTATIONS: Record<HeartKind, string> = {
  elector: `mutation Heart($id: String!) {
  heartTopic(topicId: $id) { hearted }
}`,
  host: `mutation HostHeart($id: String!) {
  hostHeartTopic(topicId: $id) { hearted }
}`,
};

/** Same symbol for both gestures (QA 2026-08-05: the host row briefly used
 * 🤍/💙 emoji while the public row used the outline/filled icon): the
 * lucide Heart, outline = not hearted, filled = hearted. The gesture is
 * told apart by colour — .host-heart-btn.on wears the host palette, the
 * elector .on the ❤️ red — matching the copy convention (emoji in text,
 * icon in buttons). */
function glyph(filled: boolean): React.ReactNode {
  return (
    <Heart size={16} fill={filled ? "currentColor" : "none"} aria-hidden />
  );
}

export function HeartButton({
  topicId,
  hearted,
  count,
  kind = "elector",
}: {
  topicId: string;
  hearted: boolean;
  count: number;
  kind?: HeartKind;
}) {
  const { run, busy } = useGqlAction();
  const icRef = useRef<HTMLSpanElement>(null);
  const emoji = kind === "host" ? "💙" : "❤️";
  const title = hearted
    ? `${emoji}'d — click to remove`
    : `${emoji} this topic`;

  function toggle() {
    const wasHearted = hearted;
    void run(
      MUTATIONS[kind],
      { id: topicId },
      {
        errorFallback: `Could not update ${emoji}`,
        onSuccess: () => {
          if (!wasHearted && icRef.current) {
            icRef.current.classList.remove("heart-pop");
            // force reflow so the animation can replay on consecutive hearts
            void icRef.current.offsetWidth;
            icRef.current.classList.add("heart-pop");
          }
        },
      },
    );
  }

  return (
    <button
      type="button"
      className={`heart-btn ${kind === "host" ? "host-heart-btn " : ""}${hearted ? "on" : ""}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={hearted}
      aria-label={title}
      title={title}
    >
      <span className="ic" ref={icRef}>
        {glyph(hearted)}
      </span>
      {count}
    </button>
  );
}

/** The read-only count for viewers without the gesture (non-electors on
 * the public row; admins and dual-role hosts in the host-only thread) —
 * shared so both rows render it identically. */
export function HeartCount({
  count,
  kind = "elector",
}: {
  count: number;
  kind?: HeartKind;
}) {
  return (
    <span
      className={`heart-btn ${kind === "host" ? "host-heart-btn" : ""}`}
      aria-hidden
    >
      <span className="ic">{glyph(true)}</span>
      {count}
    </span>
  );
}
