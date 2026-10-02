"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { ForumMentionTextarea } from "@/components/MentionTextarea";
import { draftKey, hasDraft, useDraft } from "@/lib/commentDrafts";
import { nounTitle, useCommentThread } from "@/lib/commentThreadAdapter";
import { useGqlAction } from "@/lib/useGqlAction";

function ReplyTextarea({
  body,
  onChange,
  mentionSlug,
}: {
  body: string;
  onChange(value: string): void;
  mentionSlug?: string;
}) {
  if (mentionSlug) {
    return (
      <ForumMentionTextarea
        mentionSlug={mentionSlug}
        value={body}
        onChange={onChange}
        placeholder="Write a reply… (@ to mention)"
        ariaLabel="Reply"
      />
    );
  }
  return (
    <GrowingTextarea
      value={body}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write a reply…"
      aria-label="Reply"
    />
  );
}

export function CommentActions({
  commentId,
  canReply,
  canModerate,
  hidden,
  isOwn = false,
  onEdit,
  canPin = false,
  pinned = false,
  mentionSlug,
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
  /** Timetable slug — enables @mention autocomplete for public replies. */
  mentionSlug?: string;
}) {
  // ?reply= deep links focus a chain-tail composer (dialogue-first
  // threading, 2026-08-13) — this composer only opens from its button.
  const { run, busy } = useGqlAction();
  // Topic comments by default; the Lounge swaps in its own mutations.
  const thread = useCommentThread();
  const Noun = nounTitle(thread);
  const after = {
    refresh: thread.routerRefresh,
    onSuccess: () => thread.onChanged?.(),
  };
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
      thread.reply,
      { id: commentId, body: text },
      {
        success: "Reply posted",
        errorFallback: "Could not reply",
        refresh: thread.routerRefresh,
        onSuccess: () => {
          clearBody();
          setOpen(false);
          thread.onChanged?.();
        },
      },
    );
  }

  function toggleHidden() {
    void run(
      thread.hide,
      { id: commentId, hidden: !hidden },
      {
        success: hidden ? `${Noun} unhidden` : `${Noun} hidden`,
        errorFallback: `Could not update ${thread.noun}`,
        ...after,
      },
    );
  }

  function togglePinned() {
    void run(
      thread.pin,
      { id: commentId, pinned: !pinned },
      {
        success: pinned ? `${Noun} unpinned` : `${Noun} pinned`,
        errorFallback: `Could not update ${thread.noun}`,
        ...after,
      },
    );
  }

  function remove() {
    if (!confirm(`Delete this ${thread.noun}? This can't be undone.`)) {
      return;
    }
    void run(
      thread.remove,
      { id: commentId },
      {
        success: `${Noun} deleted`,
        errorFallback: `Could not delete ${thread.noun}`,
        ...after,
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
            <ReplyTextarea
              body={body}
              onChange={setBody}
              mentionSlug={mentionSlug}
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
