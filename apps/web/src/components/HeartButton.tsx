"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

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
  const [pending, startTransition] = useTransition();

  async function toggle() {
    try {
      await clientGql(MUTATION, { id: topicId });
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update heart");
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
      <span className="ic">{hearted ? "\u2665" : "\u2661"}</span>
      {count}
    </button>
  );
}
