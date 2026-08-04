"use client";

import { useRef } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation HostHeart($id: String!) {
  hostHeartTopic(topicId: $id) { hearted }
}`;

/** The 💙 toggle (host hearts, 2026-08-04) — the parallel gesture for
 * hosts who aren't electors. Lives INSIDE the host-only thread (QA
 * 2026-08-04: placement makes the audience self-evident), styled like the
 * public ❤️ button with the topic's 💙 count. Cross-topic tallies stay
 * admin eyes only. */
export function HostHeartButton({
  topicId,
  hearted,
  count,
}: {
  topicId: string;
  hearted: boolean;
  count: number;
}) {
  const { run, busy } = useGqlAction();
  const icRef = useRef<HTMLSpanElement>(null);
  const title = hearted ? "💙'd — click to remove" : "💙 this topic";

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
      {count}
    </button>
  );
}
