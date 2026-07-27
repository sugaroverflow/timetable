"use client";

import { Heart, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const HEART = `mutation QueueHeart($id: String!) {
  heartTopic(topicId: $id) { hearted }
}`;

const LATER = `mutation QueueLater($id: String!) {
  queueMarkSeen(topicId: $id)
}`;

/** The Topic Queue's decision bar: ❤️ (vote and advance) or Later (come
 * around again next round). Both record the topic as seen; the server
 * re-render shows the next one. */
export function QueueControls({
  topicId,
  position,
  roundSize,
}: {
  topicId: string;
  position: number;
  roundSize: number;
}) {
  const router = useRouter();
  const { toastError } = useToast();
  const [busy, setBusy] = useState(false);

  async function act(mutation: string) {
    setBusy(true);
    try {
      await clientGql(mutation, { id: topicId });
      router.refresh();
    } catch {
      toastError("That didn't save — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="queue-bar">
      <button
        type="button"
        className="btn queue-heart"
        disabled={busy}
        onClick={() => act(HEART)}
      >
        <Heart size={16} aria-hidden /> ❤️ this topic
      </button>
      <button
        type="button"
        className="btn queue-later"
        disabled={busy}
        onClick={() => act(LATER)}
      >
        <RotateCcw size={16} aria-hidden /> Later
      </button>
      <span className="faint queue-progress">
        {position} of {roundSize} this round
      </span>
    </div>
  );
}

const RESTART = `mutation QueueRestart($s: String!) {
  queueRestartRound(idOrSlug: $s)
}`;

/** End-of-round: the explicit "you've seen everything" moment, with
 * restarting as a choice rather than a treadmill. */
export function QueueRestartButton({
  slug,
  roundSize,
}: {
  slug: string;
  roundSize: number;
}) {
  const router = useRouter();
  const { toastError } = useToast();
  const [busy, setBusy] = useState(false);

  async function restart() {
    setBusy(true);
    try {
      await clientGql(RESTART, { s: slug });
      router.refresh();
    } catch {
      toastError("That didn't save — try again.");
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn" disabled={busy} onClick={restart}>
      <RotateCcw size={16} aria-hidden /> Start another round ({roundSize} topic
      {roundSize === 1 ? "" : "s"})
    </button>
  );
}
