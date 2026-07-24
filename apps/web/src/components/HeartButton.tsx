"use client";

import { Heart } from "lucide-react";
import { useRef } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation Heart($id: String!) {
  heartTopic(topicId: $id) { hearted }
}`;

export function HeartButton({
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

  function toggle() {
    const wasHearted = hearted;
    void run(
      MUTATION,
      { id: topicId },
      {
        errorFallback: "Could not update heart",
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
      className={`heart-btn ${hearted ? "on" : ""}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={hearted}
    >
      <span className="ic" ref={icRef}>
        <Heart size={16} fill={hearted ? "currentColor" : "none"} aria-hidden />
      </span>
      {count}
    </button>
  );
}
