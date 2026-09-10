"use client";

import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import {
  isTypingTarget,
  queueKeyAction,
  type QueueKeyAction,
} from "@/lib/queueKeys";

import { useCommentsOpen } from "./CommentsOpenScope";

const HEART = `mutation QueueHeart($id: String!) {
  heartTopic(topicId: $id) { hearted }
}`;

const HOST_HEART = `mutation QueueHostHeart($id: String!) {
  hostHeartTopic(topicId: $id) { hearted }
}`;

const NEXT = `mutation QueueNext($id: String!) {
  queueMarkSeen(topicId: $id)
}`;

function switchLabel(hearted: boolean, hostMode: boolean): string {
  const glyph = hostMode ? "💙" : "❤️";
  return hearted ? `${glyph}'d — click to remove` : `${glyph} this topic`;
}

/** ↓ puts the caret in this topic's public composer. The box may not be
 * in the DOM yet: `requestOpen` can be switching the topic-tabs strip back
 * to Comments (followCommentsOpen), and that pane renders a frame later —
 * hence the bounded retry rather than one look. */
function focusComposer(topicId: string, attempt = 0) {
  const box = document.querySelector<HTMLTextAreaElement>(
    `[data-topic-composer="${topicId}"]`,
  );
  if (box) {
    box.focus();
    box.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (attempt < 3) {
    requestAnimationFrame(() => focusComposer(topicId, attempt + 1));
  }
}

/** The arrow legend under the bar (queue-keys, 2026-09-07). The buttons
 * carry the same shortcuts in `aria-keyshortcuts`, so this is the sighted
 * reader's copy of what assistive tech is already told — aria-hidden
 * keeps it from being read twice. */
function QueueKeyHints({
  canHeart,
  back,
}: {
  canHeart: boolean;
  back: number;
}) {
  return (
    <p className="faint queue-keys" aria-hidden>
      <span>
        <kbd>←</kbd> back
      </span>
      {canHeart ? (
        <span>
          <kbd>↑</kbd> ❤️
        </span>
      ) : null}
      <span>
        <kbd>↓</kbd> comment
      </span>
      <span>
        <kbd>→</kbd> {back > 0 ? "forward" : "next"}
      </span>
    </p>
  );
}

/** queue-back's left arrow: a link, because the step lives in the URL.
 * Disabled rather than absent on the first card of a round, so the ❤️
 * switch doesn't shift sideways when history appears. */
function BackStep({ href }: { href: string | null }) {
  if (!href) {
    return (
      <button
        type="button"
        className="queue-btn queue-btn-back"
        aria-label="Previous topic"
        title="Nothing to go back to yet"
        aria-keyshortcuts="ArrowLeft"
        disabled
      >
        <ArrowLeft size={24} aria-hidden />
      </button>
    );
  }
  return (
    <Link
      className="queue-btn queue-btn-back"
      href={href}
      aria-label="Previous topic"
      title="Previous topic (←)"
      aria-keyshortcuts="ArrowLeft"
    >
      <ArrowLeft size={24} aria-hidden />
    </Link>
  );
}

/** The right arrow while looking back: one step forward, landing on the
 * live topic at step 0. Marks nothing seen — this topic already is. */
function ForwardStep({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="queue-btn queue-btn-next"
      href={href}
      aria-label={label}
      title={`${label} (→)`}
      aria-keyshortcuts="ArrowRight"
    >
      <ArrowRight size={30} aria-hidden />
    </Link>
  );
}

/** A real switch (QA 2026-07-29: the 🤍/❤️ glyph swap read as ambiguous):
 * heart + track/thumb toggle inside one pill. */
function HeartSwitch({
  hearted,
  hostMode,
  busy,
  onToggle,
}: {
  hearted: boolean;
  hostMode: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const label = switchLabel(hearted, hostMode);
  return (
    <button
      type="button"
      className={`queue-switch${hearted ? " on" : ""}`}
      role="switch"
      aria-checked={hearted}
      aria-label={label}
      title={`${label} (↑)`}
      aria-keyshortcuts="ArrowUp"
      disabled={busy}
      onClick={onToggle}
    >
      <span className="queue-switch-heart" aria-hidden>
        {hearted ? (hostMode ? "💙" : "❤️") : "🤍"}
      </span>
      <span className="queue-switch-track" aria-hidden>
        <span className="queue-switch-thumb" />
      </span>
    </button>
  );
}

/**
 * The Topic Queue's decision controls (v2 2026-07-29): a ❤️ on/off
 * SWITCHER and a Next button — the member decides whether the topic is
 * hearted, then moves on. Same big round layout as v1's two buttons.
 * Toggling the heart saves immediately but does NOT advance (no refresh —
 * hearting marks the topic seen server-side, so a refresh would skip it);
 * only Next advances. Host-non-electors get the same switch bound to 💙
 * (host hearts, 2026-08-04); members with neither gesture read through
 * with Next alone.
 */
export function QueueControls({
  topicId,
  hearted: initialHearted,
  canHeart,
  hostMode = false,
  slug,
  back = 0,
  historyCount = 0,
}: {
  topicId: string;
  hearted: boolean;
  canHeart: boolean;
  /** Bind the switch to 💙 instead of ❤️ (the viewer's roles decide —
   * one person, one gesture). */
  hostMode?: boolean;
  slug: string;
  /** queue-back: how many topics behind the live one this card is. */
  back?: number;
  /** How many reviewed topics are available to step back through. */
  historyCount?: number;
}) {
  const router = useRouter();
  const { toastError } = useToast();
  // ↓ unfolds the comment-teaser the same way the 💬 button does.
  const { requestOpen } = useCommentsOpen();
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
      await clientGql(hostMode ? HOST_HEART : HEART, { id: topicId });
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

  // queue-back (Ed, 2026-08-21): the step lives in the URL, so going back
  // is ordinary navigation — the browser's own Back works too, and none
  // of it writes anything (re-showing a topic never un-reviews it).
  const stepHref = (n: number) =>
    n <= 0 ? `/f/${slug}/queue` : `/f/${slug}/queue?back=${n}`;
  const canGoBack = back < historyCount;

  /** ↓: open this card's discussion and put the caret in the composer.
   * Enter there posts (CommentComposer's `submitOnEnter`), Escape hands
   * the arrows back to the queue. */
  function openComposer() {
    requestOpen();
    focusComposer(topicId);
  }

  // queue-keys (2026-09-07): a round is worked through from the keyboard —
  // the four arrows are the four buttons on this bar. Held in a ref so the
  // listener binds once per mount and still runs against the CURRENT
  // topic: router.refresh() reconciles this component in place (see the
  // note above), so a listener that closed over `topicId` would keep
  // hearting the topic you had two cards ago.
  const runAction = useRef<(action: QueueKeyAction) => void>(() => {});
  useEffect(() => {
    runAction.current = (action) => {
      if (action === "back") {
        if (canGoBack) router.push(stepHref(back + 1));
      } else if (action === "next") {
        if (busy) return;
        if (back > 0) router.push(stepHref(back - 1));
        else void next();
      } else if (action === "heart") {
        if (canHeart && !busy) void toggleHeart();
      } else {
        openComposer();
      }
    };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      const action = queueKeyAction(e);
      if (!action) return;
      // ↑/↓ would otherwise scroll the page under the card.
      e.preventDefault();
      runAction.current(action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="queue-bar">
        <BackStep href={canGoBack ? stepHref(back + 1) : null} />
        {canHeart ? (
          <HeartSwitch
            hearted={hearted}
            hostMode={hostMode}
            busy={busy}
            onToggle={toggleHeart}
          />
        ) : null}
        {back > 0 ? (
          <ForwardStep
            href={stepHref(back - 1)}
            label={back === 1 ? "Back to where you were" : "Forward"}
          />
        ) : (
          <button
            type="button"
            className="queue-btn queue-btn-next"
            aria-label="Next topic"
            title="Next topic (→)"
            aria-keyshortcuts="ArrowRight"
            disabled={busy}
            onClick={next}
          >
            <ArrowRight size={30} aria-hidden />
          </button>
        )}
      </div>
      <QueueKeyHints canHeart={canHeart} back={back} />
    </>
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
