"use client";

import Link from "next/link";
import { useState } from "react";
import { Send } from "lucide-react";

import type {
  CalendarPerms,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import { clientGql } from "@/lib/clientGraphql";
import type { RoleLabels } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

import { Avatar } from "./Avatar";
import { GrowingTextarea } from "./GrowingTextarea";
import { PrimaryRolePill } from "./RolePills";

const COMMENTS_QUERY = `query($id: String!) {
  slotComments(slotId: $id) {
    id authorId authorName authorImage authorRoles body topicTitle editedAt hidden createdAt
    counts { green yellow red }
  }
}`;
const ADD_COMMENT = `mutation($id: String!, $body: String!, $topic: String) {
  addSlotComment(slotId: $id, body: $body, topicId: $topic) { id }
}`;
const UPDATE_COMMENT = `mutation($id: String!, $body: String!) {
  updateSlotComment(commentId: $id, body: $body)
}`;
const DELETE_COMMENT = `mutation($id: String!) { deleteSlotComment(commentId: $id) }`;
const HIDE_COMMENT = `mutation($id: String!, $hidden: Boolean!) {
  hideSlotComment(commentId: $id, hidden: $hidden)
}`;

export type SlotComment = {
  id: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorRoles: string[];
  body: string;
  topicTitle: string | null;
  counts: { green: number; yellow: number; red: number } | null;
  editedAt: string | null;
  hidden: boolean;
  createdAt: string;
};

/** The row fetches its thread when it unfolds (and after actions). */
export async function fetchSlotComments(
  slotId: string,
): Promise<SlotComment[]> {
  const data = await clientGql<{ slotComments: SlotComment[] }>(
    COMMENTS_QUERY,
    { id: slotId },
  );
  return data.slotComments;
}

/** Edit / Delete (author) and Hide / Unhide (admin) under a slot comment —
 * same control row as topic comments (QA 2026-08-03). */
function SlotCommentActions({
  comment,
  isOwn,
  canModerate,
  onEdit,
  onChanged,
}: {
  comment: SlotComment;
  isOwn: boolean;
  canModerate: boolean;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const { run, busy } = useGqlAction();
  if (!isOwn && !canModerate) return null;

  function act(
    query: string,
    variables: Record<string, unknown>,
    success: string,
  ) {
    void run(query, variables, {
      success,
      errorFallback: "Could not update comment",
      onSuccess: onChanged,
    });
  }

  return (
    <div className="comment-actions">
      {isOwn ? (
        <button type="button" onClick={onEdit} disabled={busy}>
          Edit
        </button>
      ) : null}
      {isOwn ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm("Delete this comment? This can't be undone."))
              act(DELETE_COMMENT, { id: comment.id }, "Comment deleted");
          }}
        >
          Delete
        </button>
      ) : null}
      {canModerate ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(
              HIDE_COMMENT,
              { id: comment.id, hidden: !comment.hidden },
              comment.hidden ? "Comment unhidden" : "Comment hidden",
            )
          }
        >
          {comment.hidden ? "Unhide" : "Hide"}
        </button>
      ) : null}
    </div>
  );
}

/** In-place editor for the author's own slot comment. */
function SlotCommentEditor({
  comment,
  onDone,
}: {
  comment: SlotComment;
  onDone: () => Promise<void>;
}) {
  const { run, busy } = useGqlAction();
  const [body, setBody] = useState(comment.body);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      UPDATE_COMMENT,
      { id: comment.id, body: text },
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
    </form>
  );
}

/** One comment; a session claim renders its topic + frozen snapshot chip.
 * Avatar and name link to the author's person page; the author gets
 * edit/delete and admins hide/unhide, like comments everywhere. */
function CommentRow({
  comment,
  slug,
  viewerId,
  canModerate,
  roleLabels,
  onChanged,
}: {
  comment: SlotComment;
  slug: string;
  viewerId: string | null;
  canModerate: boolean;
  roleLabels?: RoleLabels;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const personHref = `/f/${slug}/${comment.authorId}`;
  const isOwn = viewerId !== null && comment.authorId === viewerId;

  return (
    <div className={`hc${comment.hidden ? " cal-comment-hidden" : ""}`}>
      <Link href={personHref} className="cal-person-link">
        <Avatar name={comment.authorName} image={comment.authorImage} small />
      </Link>
      <div style={{ flex: 1 }}>
        <div className="hc-name">
          <Link href={personHref}>{comment.authorName ?? "Someone"}</Link>
          <PrimaryRolePill roles={comment.authorRoles} labels={roleLabels} />
          {comment.editedAt ? (
            <span className="faint" style={{ fontWeight: 400 }}>
              {" "}
              (edited)
            </span>
          ) : null}
          {comment.hidden ? (
            <span className="faint" style={{ fontWeight: 400 }}>
              {" "}
              (hidden)
            </span>
          ) : null}
        </div>
        {editing ? (
          <SlotCommentEditor
            comment={comment}
            onDone={async () => {
              setEditing(false);
              await onChanged();
            }}
          />
        ) : (
          <div className="hc-bubble">
            {comment.body}
            {comment.topicTitle ? (
              <div className="cal-claim">
                📌 {comment.topicTitle}
                {comment.counts
                  ? ` · 🟢 ${comment.counts.green} 🟡 ${comment.counts.yellow} 🔴 ${comment.counts.red}`
                  : ""}
              </div>
            ) : null}
          </div>
        )}
        <SlotCommentActions
          comment={comment}
          isOwn={isOwn}
          canModerate={canModerate}
          onEdit={() => setEditing(!editing)}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

/** The discussion thread + claim composer (host/admin only). Comments are
 * fetched by the row when it unfolds and reloaded after a post. */
export function DiscussionPanel({
  slot,
  slug,
  perms,
  lensTopic,
  comments,
  roleLabels,
  onReload,
}: {
  slot: CalendarSlot;
  slug: string;
  perms: CalendarPerms;
  /** The page's active topic lens — posting attaches it + the snapshot;
   * "All electors" (null) posts a plain comment (QA 2026-08-03). */
  lensTopic: TopicOption | null;
  comments: SlotComment[] | null;
  roleLabels?: RoleLabels;
  onReload: () => Promise<void>;
}) {
  const { run, busy } = useGqlAction();
  const [body, setBody] = useState("");

  function post(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      ADD_COMMENT,
      { id: slot.id, body: text, topic: lensTopic?.id ?? null },
      {
        errorFallback: "Could not post",
        onSuccess: async () => {
          setBody("");
          await onReload();
        },
      },
    );
  }

  return (
    <div className="host-thread">
      {comments?.map((c) => (
        <CommentRow
          key={c.id}
          comment={c}
          slug={slug}
          viewerId={perms.viewerId}
          canModerate={perms.canAdmin}
          roleLabels={roleLabels}
          onChanged={onReload}
        />
      ))}
      {comments && comments.length === 0 ? (
        <div className="faint" style={{ fontSize: 12, padding: "4px 0" }}>
          No messages yet.
        </div>
      ) : null}
      {/* Same composer shape as everywhere else (QA 2026-08-02). */}
      <form onSubmit={post} className="stack" style={{ gap: 6 }}>
        <div className="inline-form inline-form-nested">
          <GrowingTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add to the discussion…"
            aria-label="Slot message"
          />
          <button
            className="btn btn-primary btn-send"
            type="submit"
            disabled={busy}
            aria-label="Send message"
            title="Send"
          >
            <Send size={16} aria-hidden />
          </button>
        </div>
        {lensTopic ? (
          <span className="faint" style={{ fontSize: 12 }}>
            Posting attaches <strong>{lensTopic.title}</strong> with its current
            🟢🟡🔴 counts.
          </span>
        ) : null}
      </form>
    </div>
  );
}
