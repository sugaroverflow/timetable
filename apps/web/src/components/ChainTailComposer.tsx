"use client";

import { Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { ForumMentionTextarea } from "@/components/MentionTextarea";
import { draftKey, useDraft } from "@/lib/commentDrafts";
import { useCommentThread } from "@/lib/commentThreadAdapter";
import { useGqlAction } from "@/lib/useGqlAction";

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
 *
 * `foot` (the Lounge's quiet thread, 2026-10-02): the same composer as
 * the ONE "Reply…" box at the foot of a conversation, answering the
 * opening post — a pill-shaped input; same draft key, same deep links.
 */
export function ChainTailComposer({
  parentId,
  focusIds,
  foot = false,
  mentionSlug,
}: {
  /** The comment new messages attach to (the chain's parent). */
  parentId: string;
  /** Comment ids whose ?reply= deep links should focus this composer. */
  focusIds: string[];
  /** Render as the conversation's foot "Reply…" box (the Lounge). */
  foot?: boolean;
  /** Timetable slug — enables @mention autocomplete for public replies. */
  mentionSlug?: string;
}) {
  const { run, busy } = useGqlAction();
  const thread = useCommentThread();
  const searchParams = useSearchParams();
  const replyTarget = searchParams.get("reply");
  const deepLinked = replyTarget != null && focusIds.includes(replyTarget);
  const [body, setBody, clearBody] = useDraft(draftKey.chain(parentId));
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
      thread.reply,
      { id: parentId, body: text },
      {
        success: "Reply posted",
        errorFallback: "Could not reply",
        refresh: thread.routerRefresh,
        onSuccess: () => {
          clearBody();
          thread.onChanged?.();
        },
      },
    );
  }

  return (
    <ComposerRow
      className={foot ? "foot-composer" : "inline-form-nested tail-composer"}
    >
      <form
        onSubmit={submit}
        className="inline-form"
        id={foot ? footComposerId(parentId) : undefined}
      >
        {mentionSlug ? (
          <ForumMentionTextarea
            mentionSlug={mentionSlug}
            textareaRef={textareaRef}
            value={body}
            onChange={setBody}
            placeholder={
              // The foot box stays one short line on a phone, so it says
              // only "Reply…"; @ still opens the picker.
              foot ? "Reply…" : "Continue this thread… (@ to mention)"
            }
            ariaLabel={
              foot ? "Reply to this conversation" : "Continue this thread"
            }
          />
        ) : (
          <GrowingTextarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={foot ? "Reply…" : "Continue this thread…"}
            aria-label={
              foot ? "Reply to this conversation" : "Continue this thread"
            }
          />
        )}
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

/** The foot composer's form id — "Reply" on an opening post focuses
 * it rather than opening a second box that answers the same post. */
export function footComposerId(parentId: string): string {
  return `thread-foot-${parentId}`;
}
