"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, Reply, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { draftKey, hasDraft, useDraft } from "@/lib/commentDrafts";
import { nounTitle, useCommentThread } from "@/lib/commentThreadAdapter";
import { useGqlAction } from "@/lib/useGqlAction";

export function CommentActions({
  commentId,
  canReply,
  canModerate,
  hidden,
  isOwn = false,
  onEdit,
  canPin = false,
  pinned = false,
  chips,
  react,
  onReply,
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
  /** Quiet variant only (the Lounge): the reaction chips, which lead the
   * action row and stay in view on replies without hover. */
  chips?: ReactNode;
  /** Quiet variant only: the add-reaction button, first in the toolbar. */
  react?: ReactNode;
  /** Replaces opening the inline box — an opening post's Reply focuses
   * the conversation's foot composer instead. */
  onReply?: () => void;
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
  const replyBox = useRef<HTMLTextAreaElement>(null);
  // Quiet threads have no chain tails, so a Reply box opened on purpose
  // (button or deep link) takes the focus a tail would have had.
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  useEffect(() => {
    if (!open || !focusOnOpen) return;
    replyBox.current?.focus();
    replyBox.current?.scrollIntoView({ block: "center" });
    setFocusOnOpen(false);
  }, [open, focusOnOpen]);

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

  const replyForm = open ? (
    <ComposerRow className="inline-form-nested">
      <form onSubmit={reply} className="inline-form">
        <GrowingTextarea
          ref={replyBox}
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
  ) : null;

  if (thread.variant === "quiet") {
    // ONE row (Ed's quiet thread, 2026-10-02): reacts, Reply, and the
    // rest behind ⋯ — the same permissions as the topic row's words.
    const items: { label: string; act: () => void }[] = [];
    if (isOwn && onEdit) items.push({ label: "Edit", act: onEdit });
    if (isOwn) items.push({ label: "Delete", act: remove });
    if (canModerate) {
      items.push({ label: hidden ? "Unhide" : "Hide", act: toggleHidden });
    }
    if (canPin) {
      items.push({ label: pinned ? "Unpin" : "Pin", act: togglePinned });
    }
    return (
      <>
        <div className="lq-actions">
          {chips}
          <span className="lq-tools">
            {react}
            {canReply ? (
              <button
                type="button"
                className="lq-reply"
                aria-label="Reply"
                aria-expanded={onReply ? undefined : open}
                onClick={
                  onReply ??
                  (() => {
                    if (!open) setFocusOnOpen(true);
                    toggleReply();
                  })
                }
              >
                <Reply size={16} aria-hidden className="lq-reply-icon" />
                <span className="lq-reply-label">Reply</span>
              </button>
            ) : null}
            {items.length > 0 ? (
              <Menu.Root>
                <Menu.Trigger
                  className="lq-more"
                  aria-label="More actions"
                  title="More actions"
                  disabled={busy}
                >
                  <MoreHorizontal size={16} aria-hidden />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    className="tt-switcher-positioner"
                    side="bottom"
                    align="end"
                    sideOffset={4}
                  >
                    <Menu.Popup className="tt-switcher-list lq-menu">
                      {items.map((item) => (
                        <Menu.Item
                          key={item.label}
                          className="tt-menu-item"
                          onClick={item.act}
                        >
                          {item.label}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            ) : null}
          </span>
        </div>
        {replyForm}
        {thread.footComposer && canReply && !onReply ? (
          <ReplyDeepLink
            commentId={commentId}
            onHit={() => {
              setFocusOnOpen(true);
              setOpen(true);
            }}
          />
        ) : null}
      </>
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
      {replyForm}
    </>
  );
}

/** A `?reply=<id>` deep link (digest Reply →, notifications) aimed at
 * this message, in a thread without chain tails: open its inline box. */
function ReplyDeepLink({
  commentId,
  onHit,
}: {
  commentId: string;
  onHit: () => void;
}) {
  const hit = useSearchParams().get("reply") === commentId;
  const fired = useRef(false);
  useEffect(() => {
    if (!hit || fired.current) return;
    fired.current = true;
    onHit();
  }, [hit, onHit]);
  return null;
}
