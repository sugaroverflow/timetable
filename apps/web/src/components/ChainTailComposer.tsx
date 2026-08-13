"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { useGqlAction } from "@/lib/useGqlAction";

const REPLY = `mutation ContinueThread($id: String!, $body: String!) {
  replyToComment(commentId: $id, body: $body) { id }
}`;

/**
 * The chain-tail composer (dialogue-first threading, 2026-08-13): a slim
 * always-there input ending each dialogue chain. Posting attaches the
 * message to the chain's PARENT comment (root-attach, Slack-style), so a
 * dialogue stays one level deep no matter how long it runs — forking via
 * a chain message's Reply button is the rarer gesture.
 *
 * Digest emails deep-link replies as `?reply=<comment id>`; `focusIds`
 * holds the ids this tail answers for (the chain parent + its childless
 * messages), so those links land here, focused, continuing the chain.
 */
export function ChainTailComposer({
  parentId,
  focusIds,
}: {
  /** The comment new messages attach to (the chain's parent). */
  parentId: string;
  /** Comment ids whose ?reply= deep links should focus this composer. */
  focusIds: string[];
}) {
  const { run, busy } = useGqlAction();
  const searchParams = useSearchParams();
  const replyTarget = searchParams.get("reply");
  const deepLinked = replyTarget != null && focusIds.includes(replyTarget);
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!deepLinked) return;
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ block: "center" });
  }, [deepLinked]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      REPLY,
      { id: parentId, body: text },
      {
        success: "Reply posted",
        errorFallback: "Could not reply",
        onSuccess: () => setBody(""),
      },
    );
  }

  return (
    <ComposerRow className="inline-form-nested tail-composer">
      <form onSubmit={submit} className="inline-form">
        <GrowingTextarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Continue this thread…"
          aria-label="Continue this thread"
        />
        <button
          className="btn btn-primary btn-send"
          type="submit"
          disabled={busy}
          aria-label="Post reply"
          title="Reply"
        >
          <Send size={16} aria-hidden />
        </button>
      </form>
    </ComposerRow>
  );
}
