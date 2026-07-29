"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
  const [inFlight, setInFlight] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hearted, setHearted] = useState(initialHearted);
  const [lastTopicId, setLastTopicId] = useState(topicId);

  // router.refresh() reconciles this client component IN PLACE — even the
  // key #179 put on the queue's TopicCard (a server component) doesn't
  // force a remount, so the previous topic's busy/hearted state leaked
  // into the next card (Next wedged after one click — reproduced on dev,
  // 2026-07-29, twice). Reset per-topic state during render instead: the
  // React "derive state from props" pattern survives either behaviour.
  if (topicId !== lastTopicId) {
    setLastTopicId(topicId);
    setHearted(initialHearted);
    setInFlight(false);
  }

  // isPending covers the refresh transition, so even a reconciled-in-place
  // update re-enables the controls the moment the new card's data lands.
  const busy = inFlight || isPending;

  async function toggleHeart() {
    setInFlight(true);
    try {
      await clientGql(HEART, { id: topicId });
      setHearted((h) => !h);
    } catch {
      toastError("That didn't save — try again.");
    } finally {
      setInFlight(false);
    }
  }

  async function next() {
    setInFlight(true);
    try {
      await clientGql(NEXT, { id: topicId });
      startTransition(() => router.refresh());
    } catch {
      toastError("That didn't save — try again.");
    } finally {
      setInFlight(false);
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
  const [inFlight, setInFlight] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = inFlight || isPending;

  async function restart() {
    setInFlight(true);
    try {
      await clientGql(RESTART, { s: slug });
      startTransition(() => router.refresh());
    } catch {
      toastError("That didn't save — try again.");
    } finally {
      setInFlight(false);
    }
  }

  return (
    <button type="button" className="btn" disabled={busy} onClick={restart}>
      <RotateCcw size={16} aria-hidden /> Start another round ({roundSize} topic
      {roundSize === 1 ? "" : "s"})
    </button>
  );
}
