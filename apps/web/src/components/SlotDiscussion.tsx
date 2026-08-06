"use client";

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
import { PersonChip } from "./PersonChip";
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

/** The topic + 🟢🟡🔴 counts chip — on a posted claim it's the frozen
 * snapshot; under the composer it previews the live counts a post would
 * attach (QA 2026-08-06). */
function ClaimChip({
  title,
  counts,
  preview = false,
}: {
  title: string;
  counts: { green: number; yellow: number; red: number } | null;
  preview?: boolean;
}) {
  return (
    <div className={`cal-claim${preview ? " cal-claim-preview" : ""}`}>
      📌 {title}
      {counts
        ? ` · 🟢 ${counts.green} 🟡 ${counts.yellow} 🔴 ${counts.red}`
        : ""}
    </div>
  );
}

/** One comment; a session claim renders its topic + frozen snapshot chip.
 * Same structure and classes as topic comments (CommentList) so the two
 * chats can't drift (QA 2026-08-06); the author gets edit/delete and
 * admins hide/unhide, like comments everywhere. */
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
  const isOwn = viewerId !== null && comment.authorId === viewerId;

  return (
    <div className={`comment${comment.hidden ? " cal-comment-hidden" : ""}`}>
      <PersonChip slug={slug} userId={comment.authorId}>
        <Avatar name={comment.authorName} image={comment.authorImage} small />
      </PersonChip>
      <div className="comment-main">
        <div className="c-bubble">
          <span className="c-name">
            <PersonChip slug={slug} userId={comment.authorId}>
              {comment.authorName ?? "Someone"}
            </PersonChip>
          </span>
          <PrimaryRolePill roles={comment.authorRoles} labels={roleLabels} />
          {comment.hidden ? (
            <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
              hidden
            </span>
          ) : null}
          {comment.editedAt && !editing ? (
            <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
              (edited)
            </span>
          ) : null}
          <div className="c-text">
            {editing ? (
              <SlotCommentEditor
                comment={comment}
                onDone={async () => {
                  setEditing(false);
                  await onChanged();
                }}
              />
            ) : (
              <>
                {comment.body}
                {comment.topicTitle ? (
                  <ClaimChip
                    title={comment.topicTitle}
                    counts={comment.counts}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
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
    <div className="host-thread thread-stack">
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
      {/* Same composer shape as everywhere else (QA 2026-08-02). No
          empty-state line — the composer says it all (QA 2026-08-05). */}
      <form onSubmit={post} className="stack" style={{ gap: 6 }}>
        <div className="inline-form inline-form-nested">
          <GrowingTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Talk about this timeslot…"
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
        {/* The attachment, as it will appear on the posted comment — the
            lens audience drives slot.counts, which is the same computation
            the server snapshots on post (QA 2026-08-06, replaced the
            "Posting attaches…" sentence). */}
        {lensTopic ? (
          <ClaimChip title={lensTopic.title} counts={slot.counts} preview />
        ) : null}
      </form>
    </div>
  );
}
