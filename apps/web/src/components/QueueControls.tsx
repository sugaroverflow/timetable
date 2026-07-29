"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const HEART = `mutation QueueHeart($id: String!) {
  heartTopic(topicId: $id) { hearted }
}`;

const NEXT = `mutation QueueNext($id: String!) {
  queueMarkSeen(topicId: $id)
}`;

/**
 * The Topic Queue's decision controls (v2 2026-07-29): a ❤️ on/off
 * SWITCHER and a Next button — the member decides whether the topic is
 * hearted, then moves on. Same big round layout as v1's two buttons.
 * Toggling the heart saves immediately but does NOT advance (no refresh —
 * hearting marks the topic seen server-side, so a refresh would skip it);
 * only Next advances. Non-electors (hosts read the queue too) get Next
 * alone.
 */
export function QueueControls({
  topicId,
  hearted: initialHearted,
  canHeart,
}: {
  topicId: string;
  hearted: boolean;
  canHeart: boolean;
}) {
  const router = useRouter();
  const { toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [hearted, setHearted] = useState(initialHearted);

  async function toggleHeart() {
    setBusy(true);
    try {
      await clientGql(HEART, { id: topicId });
      setHearted((h) => !h);
      setBusy(false);
    } catch {
      toastError("That didn't save — try again.");
      setBusy(false);
    }
  }

  async function next() {
    setBusy(true);
    try {
      await clientGql(NEXT, { id: topicId });
      router.refresh();
    } catch {
      toastError("That didn't save — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="queue-bar">
      {canHeart ? (
        // A real switch (QA 2026-07-29: the 🤍/❤️ glyph swap read as
        // ambiguous): heart + track/thumb toggle inside one pill.
        <button
          type="button"
          className={`queue-switch${hearted ? " on" : ""}`}
          role="switch"
          aria-checked={hearted}
          aria-label={hearted ? "❤️'d — click to remove" : "❤️ this topic"}
          title={hearted ? "❤️'d — click to remove" : "❤️ this topic"}
          disabled={busy}
          onClick={toggleHeart}
        >
          <span className="queue-switch-heart" aria-hidden>
            {hearted ? "❤️" : "🤍"}
          </span>
          <span className="queue-switch-track" aria-hidden>
            <span className="queue-switch-thumb" />
          </span>
        </button>
      ) : null}
      <button
        type="button"
        className="queue-btn queue-btn-next"
        aria-label="Next topic"
        title="Next topic"
        disabled={busy}
        onClick={next}
      >
        <ArrowRight size={30} aria-hidden />
      </button>
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
