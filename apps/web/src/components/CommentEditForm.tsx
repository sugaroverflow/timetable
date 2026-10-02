"use client";

import { Send } from "lucide-react";
import { useEffect, useRef } from "react";

import { GrowingTextarea } from "@/components/GrowingTextarea";
import { draftKey, useDraft } from "@/lib/commentDrafts";
import { nounTitle, useCommentThread } from "@/lib/commentThreadAdapter";
import { SUBMIT_SHORTCUT_ARIA } from "@/lib/submitShortcut";
import { useGqlAction } from "@/lib/useGqlAction";

/** Inline comment editor (QA 2026-07-29). Swapped in PLACE of the comment
 * text — edit affordances replace the content they edit, never stack a
 * composer beneath it (Ed's app-wide rule). */
export function CommentEditForm({
  commentId,
  initialBody,
  onDone,
}: {
  commentId: string;
  initialBody: string;
  onDone(): void;
}) {
  const { run, busy } = useGqlAction();
  const thread = useCommentThread();
  // An interrupted edit keeps its text (comment-draft-store, 2026-08-21);
  // typing back to the original body drops the draft, so an untouched
  // editor never counts as one.
  const [body, setBody, clearBody] = useDraft(
    draftKey.edit(commentId),
    initialBody,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Saved or cancelled — either way the edit is over. */
  function done() {
    clearBody();
    onDone();
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // Cursor at the end, not a full-select — edits are usually appends.
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      thread.edit,
      { id: commentId, body: text },
      {
        success: `${nounTitle(thread)} updated`,
        errorFallback: `Could not update ${thread.noun}`,
        refresh: thread.routerRefresh,
        onSuccess: () => {
          done();
          thread.onChanged?.();
        },
      },
    );
  }

  return (
    <form onSubmit={save} className="inline-form inline-form-nested">
      <GrowingTextarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label={`Edit ${thread.noun}`}
      />
      <button
        className="btn btn-primary btn-send"
        aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}
        type="submit"
        disabled={busy}
        aria-label={`Save ${thread.noun}`}
        title="Save"
      >
        <Send size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={done}
        disabled={busy}
      >
        Cancel
      </button>
    </form>
  );
}
