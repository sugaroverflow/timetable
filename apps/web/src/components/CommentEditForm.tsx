"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GrowingTextarea } from "@/components/GrowingTextarea";
import { useGqlAction } from "@/lib/useGqlAction";

const EDIT = `mutation Edit($id: String!, $body: String!) {
  editComment(commentId: $id, body: $body) { id }
}`;

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
  const [body, setBody] = useState(initialBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      EDIT,
      { id: commentId, body: text },
      {
        success: "Comment updated",
        errorFallback: "Could not update comment",
        onSuccess: onDone,
      },
    );
  }

  return (
    <form onSubmit={save} className="inline-form inline-form-nested">
      <GrowingTextarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Edit comment"
      />
      <button
        className="btn btn-primary btn-send"
        type="submit"
        disabled={busy}
        aria-label="Save comment"
        title="Save"
      >
        <Send size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onDone}
        disabled={busy}
      >
        Cancel
      </button>
    </form>
  );
}
