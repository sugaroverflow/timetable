"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal, Reply, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
  textareaRef,
}: {
  body: string;
  onChange(value: string): void;
  mentionSlug?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  if (mentionSlug) {
    return (
      <ForumMentionTextarea
        mentionSlug={mentionSlug}
        textareaRef={textareaRef}
        value={body}
        onChange={onChange}
        placeholder="Write a reply… (@ to mention)"
        ariaLabel="Reply"
      />
    );
  }
  return (
    <GrowingTextarea
      ref={textareaRef}
      value={body}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write a reply…"
      aria-label="Reply"
    />
  );
}

type ActionProps = {
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
  /** Timetable slug — enables @mention autocomplete for public replies. */
  mentionSlug?: string;
};

/** The writes behind a comment's actions, and its inline Reply box's
 * state. */
function useCommentActions({
  commentId,
  hidden,
  pinned = false,
}: Pick<ActionProps, "commentId" | "hidden" | "pinned">) {
  // ?reply= deep links focus a chain-tail composer (dialogue-first
  // threading, 2026-08-13) — in a topic thread this composer only opens
  // from its button.
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
  const focusOnOpen = useRef(false);
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    replyBox.current?.focus();
    replyBox.current?.scrollIntoView({ block: "center" });
  }, [open]);

  /** Collapsing the box is a discard: it drops the draft, so "a draft
   * exists" always means live unsent text. */
  function toggleReply() {
    if (open) clearBody();
    setOpen((v) => !v);
  }

  /** Open the box and put the caret in it (quiet threads). */
  function openFocused() {
    if (open) {
      replyBox.current?.focus();
      return;
    }
    focusOnOpen.current = true;
    setOpen(true);
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

  return {
    thread,
    busy,
    open,
    body,
    setBody,
    replyBox,
    toggleReply,
    openFocused,
    reply,
    toggleHidden,
    togglePinned,
    remove,
  };
}

type ActionState = ReturnType<typeof useCommentActions>;

function ReplyForm({
  state,
  mentionSlug,
}: {
  state: ActionState;
  mentionSlug?: string;
}) {
  if (!state.open) return null;
  return (
    <ComposerRow className="inline-form-nested">
      <form onSubmit={state.reply} className="inline-form">
        <ReplyTextarea
          body={state.body}
          onChange={state.setBody}
          mentionSlug={mentionSlug}
          textareaRef={state.replyBox}
        />
        <button
          className="btn btn-primary btn-send"
          type="submit"
          disabled={state.busy}
          aria-label="Post reply"
          title="Reply"
        >
          <Send size={16} aria-hidden />
        </button>
      </form>
    </ComposerRow>
  );
}

/** The ⋯ menu's entries: whichever of Edit / Delete / Hide / Pin the
 * viewer may use — the same permissions as the topic row's words. */
function menuItems(
  props: ActionProps,
  state: ActionState,
): { label: string; act: () => void }[] {
  const items: { label: string; act: () => void }[] = [];
  if (props.isOwn && props.onEdit) {
    items.push({ label: "Edit", act: props.onEdit });
  }
  if (props.isOwn) items.push({ label: "Delete", act: state.remove });
  if (props.canModerate) {
    const label = props.hidden ? "Unhide" : "Hide";
    items.push({ label, act: state.toggleHidden });
  }
  if (props.canPin) {
    const label = props.pinned ? "Unpin" : "Pin";
    items.push({ label, act: state.togglePinned });
  }
  return items;
}

function MoreMenu({
  items,
  busy,
}: {
  items: { label: string; act: () => void }[];
  busy: boolean;
}) {
  if (items.length === 0) return null;
  return (
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
  );
}

/** The quiet variant's ONE row (Ed's quiet thread, 2026-10-02): reaction
 * chips, then the tools — add-reaction, Reply, ⋯. On replies with hover
 * the tools float as a toolbar (CSS); the chips stay put. */
function QuietActions(props: ActionProps & { state: ActionState }) {
  const { state, canReply, onReply, commentId } = props;
  const toggle = state.open ? state.toggleReply : state.openFocused;
  const deepLinkable =
    state.thread.footComposer === true && canReply && !onReply;
  return (
    <>
      <div className="lq-actions">
        {props.chips}
        <span className="lq-tools">
          {props.react}
          {canReply ? (
            <button
              type="button"
              className="lq-reply"
              aria-label="Reply"
              aria-expanded={onReply ? undefined : state.open}
              onClick={onReply ?? toggle}
            >
              <Reply size={16} aria-hidden className="lq-reply-icon" />
              <span className="lq-reply-label">Reply</span>
            </button>
          ) : null}
          <MoreMenu items={menuItems(props, state)} busy={state.busy} />
        </span>
      </div>
      <ReplyForm state={state} mentionSlug={props.mentionSlug} />
      {deepLinkable ? (
        <ReplyDeepLink commentId={commentId} onHit={state.openFocused} />
      ) : null}
    </>
  );
}

/** Today's row of action words (topic threads). */
function ActionWords(props: ActionProps & { state: ActionState }) {
  const { state, isOwn = false } = props;
  const { busy } = state;
  return (
    <>
      <div className="comment-actions">
        {props.canReply ? (
          <button type="button" onClick={state.toggleReply}>
            Reply
          </button>
        ) : null}
        {props.canPin ? (
          <button type="button" onClick={state.togglePinned} disabled={busy}>
            {props.pinned ? "Unpin" : "Pin"}
          </button>
        ) : null}
        {isOwn ? (
          <button type="button" onClick={props.onEdit} disabled={busy}>
            Edit
          </button>
        ) : null}
        {isOwn ? (
          <button type="button" onClick={state.remove} disabled={busy}>
            Delete
          </button>
        ) : null}
        {props.canModerate ? (
          <button type="button" onClick={state.toggleHidden} disabled={busy}>
            {props.hidden ? "Unhide" : "Hide"}
          </button>
        ) : null}
      </div>
      <ReplyForm state={state} mentionSlug={props.mentionSlug} />
    </>
  );
}

export function CommentActions(props: ActionProps) {
  const state = useCommentActions(props);
  return state.thread.variant === "quiet" ? (
    <QuietActions {...props} state={state} />
  ) : (
    <ActionWords {...props} state={state} />
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
