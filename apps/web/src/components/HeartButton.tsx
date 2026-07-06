"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

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
  const router = useRouter();
  const { toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const icRef = useRef<HTMLSpanElement>(null);

  async function toggle() {
    try {
      const wasHearted = hearted;
      await clientGql(MUTATION, { id: topicId });
      if (!wasHearted && icRef.current) {
        icRef.current.classList.remove("heart-pop");
        // force reflow so the animation can replay on consecutive hearts
        void icRef.current.offsetWidth;
        icRef.current.classList.add("heart-pop");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not update heart");
    }
  }

  return (
    <button
      type="button"
      className={`heart-btn ${hearted ? "on" : ""}`}
      onClick={toggle}
      disabled={pending}
      aria-pressed={hearted}
    >
      <span className="ic" ref={icRef}>
        {hearted ? "♥" : "♡"}
      </span>
      {count}
    </button>
  );
}
