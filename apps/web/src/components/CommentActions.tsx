"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { draftKey, hasDraft, useDraft } from "@/lib/commentDrafts";
import { useGqlAction } from "@/lib/useGqlAction";

const REPLY = `mutation Reply($id: String!, $body: String!) {
  replyToComment(commentId: $id, body: $body) { id }
}`;

const HIDE = `mutation Hide($id: String!, $hidden: Boolean!) {
  hideComment(commentId: $id, hidden: $hidden) { id }
}`;

const DELETE = `mutation Delete($id: String!) {
  deleteComment(commentId: $id)
}`;

const PIN = `mutation Pin($id: String!, $pinned: Boolean!) {
  pinComment(commentId: $id, pinned: $pinned) { id }
}`;

export function CommentActions({
  commentId,
  canReply,
  canModerate,
  hidden,
  isOwn = false,
  onEdit,
  canPin = false,
  pinned = false,
}: {
  commentId: string;
  canReply: boolean;
  canModerate: boolean;
  hidden: boolean;
  /** The viewer authored this comment: shows Edit/Delete (QA 2026-07-29). */
  isOwn?: boolean;
  onEdit?: () => void;
  /** The viewer authored the TOPIC and this is a top-level comment:
   * shows Pin/Unpin (#258). */
  canPin?: boolean;
  pinned?: boolean;
}) {
  // ?reply= deep links focus a chain-tail composer (dialogue-first
  // threading, 2026-08-13) — this composer only opens from its button.
  const { run, busy } = useGqlAction();
  // The box only exists while it is open, so an unsent draft has to be
  // able to reopen it — otherwise the text survives the tab switch but
  // stays out of reach (comment-draft-store, 2026-08-21).
  const key = draftKey.reply(commentId);
  const [open, setOpen] = useState(() => hasDraft(key));
  const [body, setBody, clearBody] = useDraft(key);

  /** Collapsing the box is a discard: it drops the draft, so "a draft
   * exists" always means live unsent text. */
  function toggleReply() {
    if (open) clearBody();
    setOpen((v) => !v);
  }

  function reply(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      REPLY,
      { id: commentId, body: text },
      {
        success: "Reply posted",
        errorFallback: "Could not reply",
        onSuccess: () => {
          clearBody();
          setOpen(false);
        },
      },
    );
  }

  function toggleHidden() {
    void run(
      HIDE,
      { id: commentId, hidden: !hidden },
      {
        success: hidden ? "Comment unhidden" : "Comment hidden",
        errorFallback: "Could not update comment",
      },
    );
  }

  function togglePinned() {
    void run(
      PIN,
      { id: commentId, pinned: !pinned },
      {
        success: pinned ? "Comment unpinned" : "Comment pinned",
        errorFallback: "Could not update comment",
      },
    );
  }

  function remove() {
    if (!confirm("Delete this comment? This can't be undone.")) return;
    void run(
      DELETE,
      { id: commentId },
      {
        success: "Comment deleted",
        errorFallback: "Could not delete comment",
      },
    );
  }

  return (
    <>
      <div className="comment-actions">
        {canReply ? (
          <button type="button" onClick={toggleReply}>
            Reply
          </button>
        ) : null}
        {canPin ? (
          <button type="button" onClick={togglePinned} disabled={busy}>
            {pinned ? "Unpin" : "Pin"}
          </button>
        ) : null}
        {isOwn ? (
          <button type="button" onClick={onEdit} disabled={busy}>
            Edit
          </button>
        ) : null}
        {isOwn ? (
          <button type="button" onClick={remove} disabled={busy}>
            Delete
          </button>
        ) : null}
        {canModerate ? (
          <button type="button" onClick={toggleHidden} disabled={busy}>
            {hidden ? "Unhide" : "Hide"}
          </button>
        ) : null}
      </div>
      {open ? (
        <ComposerRow className="inline-form-nested">
          <form onSubmit={reply} className="inline-form">
            <GrowingTextarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a reply…"
              aria-label="Reply"
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
      ) : null}
    </>
  );
}
