"use client";

import { useRef } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation HostHeart($id: String!) {
  hostHeartTopic(topicId: $id) { hearted }
}`;

/** The 💙 toggle (host hearts, 2026-08-04) — the parallel gesture for
 * hosts who aren't electors. No count on the button: tallies are admin
 * eyes only; the attributed row lives in the host-only thread. `audience`
 * keeps the button honest about who can see the 💙. */
export function HostHeartButton({
  topicId,
  hearted,
  audience,
}: {
  topicId: string;
  hearted: boolean;
  audience: string;
}) {
  const { run, busy } = useGqlAction();
  const icRef = useRef<HTMLSpanElement>(null);
  const title = hearted
    ? "💙'd — click to remove"
    : `💙 this topic · ${audience}`;

  function toggle() {
    const wasHearted = hearted;
    void run(
      MUTATION,
      { id: topicId },
      {
        errorFallback: "Could not update 💙",
        onSuccess: () => {
          if (!wasHearted && icRef.current) {
            icRef.current.classList.remove("heart-pop");
            // force reflow so the animation can replay on consecutive 💙s
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
      className={`heart-btn ${hearted ? "on" : ""}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={hearted}
      aria-label={title}
      title={title}
    >
      <span className="ic" ref={icRef} aria-hidden>
        {hearted ? "💙" : "🤍"}
      </span>
    </button>
  );
}
