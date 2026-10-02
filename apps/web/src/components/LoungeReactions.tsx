"use client";

import { Popover } from "@base-ui/react/popover";
import { SmilePlus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import type { LoungeReaction } from "@/lib/loungeThread";
import { useGqlAction } from "@/lib/useGqlAction";

const LoungeEmojiPicker = dynamic(() => import("./LoungeEmojiPicker"), {
  ssr: false,
  loading: () => <div className="emoji-picker-note">Loading…</div>,
});

const REACT = `mutation React($id: String!, $emoji: String!, $on: Boolean!) {
  setLoungeReaction(commentId: $id, emoji: $emoji, on: $on)
}`;

/** One tap for the common ones; the picker holds everything else. */
const QUICK = ["👍", "🎉", "😂", "🙏", "👀", "💡"];

/** ❤️ and 💙 are weighted votes in Topic, not reactions (Ed, 2026-09-30);
 * the API refuses them too — this just says why before the round trip. */
const RESERVED = new Set(["❤️", "❤", "💙"]);

function whoReacted(r: LoungeReaction): string {
  if (r.names.length <= 1) return r.names[0] ?? "";
  return `${r.names.slice(0, -1).join(", ")} and ${r.names[r.names.length - 1]}`;
}

/** Add/remove one of the viewer's reacts, then reload the room. */
function useReact(postId: string, onChanged: () => void) {
  const { run, busy } = useGqlAction();
  const { toastError } = useToast();
  function toggle(emoji: string, on: boolean) {
    if (RESERVED.has(emoji)) {
      toastError("❤️ and 💙 are votes here, not reactions");
      return;
    }
    void run(
      REACT,
      { id: postId, emoji, on },
      {
        errorFallback: "Could not react",
        refresh: false,
        onSuccess: onChanged,
      },
    );
  }
  return { toggle, busy };
}

type ReactProps = {
  postId: string;
  reactions: LoungeReaction[];
  onChanged(): void;
};

/** A chip per emoji with its count — names on hover; clicking a chip adds
 * or removes yours. Nothing when the post has no reacts. */
export function LoungeReactionChips({
  postId,
  reactions,
  onChanged,
}: ReactProps) {
  const { toggle, busy } = useReact(postId, onChanged);
  if (reactions.length === 0) return null;
  return (
    <div className="lounge-reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`reaction-chip${r.viewerReacted ? " mine" : ""}`}
          aria-pressed={r.viewerReacted}
          aria-label={`${r.emoji} ${r.count}: ${whoReacted(r)}`}
          title={whoReacted(r)}
          disabled={busy}
          onClick={() => toggle(r.emoji, !r.viewerReacted)}
        >
          <span aria-hidden>{r.emoji}</span>
          <span className="reaction-count">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The add-reaction button: a few common emoji and the full picker. */
export function LoungeReactionAdd({
  postId,
  reactions,
  onChanged,
  className = "reaction-add",
}: ReactProps & { className?: string }) {
  const { toggle } = useReact(postId, onChanged);
  const [open, setOpen] = useState(false);

  function pick(emoji: string) {
    setOpen(false);
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing?.viewerReacted) return;
    toggle(emoji, true);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={className}
        aria-label="Add a reaction"
        title="Add a reaction"
      >
        <SmilePlus size={15} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="reaction-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup className="reaction-popup">
            <div className="reaction-quick">
              {QUICK.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-picker-emoji"
                  onClick={() => pick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <LoungeEmojiPicker onPick={pick} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
