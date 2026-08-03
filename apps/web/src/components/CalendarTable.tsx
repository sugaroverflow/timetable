"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageCircle,
  Send,
} from "lucide-react";

import type {
  CalendarPerms,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import { clientGql } from "@/lib/clientGraphql";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

import { Avatar } from "./Avatar";
import { AvailabilityControl } from "./AvailabilityControl";
import { GrowingTextarea } from "./GrowingTextarea";

const SET_SESSION = `mutation($slot: String!, $topic: String, $status: String, $url: String) {
  setSlotSession(slotId: $slot, topicId: $topic, status: $status, url: $url)
}`;
const UPDATE_SLOT = `mutation($slot: String!, $a: String, $b: String, $loc: String) {
  updateTimeslot(slotId: $slot, startsAt: $a, endsAt: $b, location: $loc)
}`;
const DELETE_SLOT = `mutation($slot: String!) { deleteTimeslot(slotId: $slot) }`;
const COMMENTS_QUERY = `query($id: String!) {
  slotComments(slotId: $id) {
    id authorId authorName authorImage body topicTitle editedAt hidden createdAt
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

type SlotComment = {
  id: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  topicTitle: string | null;
  counts: { green: number; yellow: number; red: number } | null;
  editedAt: string | null;
  hidden: boolean;
  createdAt: string;
};

/** A slot plus its server-computed pastness (kept out of render for the
 * react purity rule). */
export type CalendarTableRow = { slot: CalendarSlot; past: boolean };

// "Fri 9 Oct" / "14:00" — en-GB pinned for day-before-month and 24h time
// (QA 2026-08-02; the viewer's own locale gave "Fri, Oct 9 02:00 PM").
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** The Monday starting this slot's week (viewer-local) — week-divider key. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toDateString();
}

function pct(n: number, total: number): string {
  return total > 0 ? `${(n / total) * 100}%` : "0%";
}

function countsTitle(c: { green: number; yellow: number; red: number }) {
  return `🟢 ${c.green} · 🟡 ${c.yellow} · 🔴 ${c.red}`;
}

/** Speech-bubble discussion button (QA 2026-08-02): count inside the
 * bubble, empty bubble when there are no messages yet. */
function CommentButton({
  slot,
  open,
  onToggle,
}: {
  slot: CalendarSlot;
  open: boolean;
  onToggle: () => Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`cal-comment-btn${slot.commentCount === 0 ? " cal-comment-empty" : ""}`}
      aria-expanded={open}
      aria-label={
        slot.commentCount > 0
          ? `Discussion (${slot.commentCount} messages)`
          : "Discussion"
      }
      title={open ? "Hide discussion" : "Discussion"}
      onClick={() => void onToggle()}
    >
      <MessageCircle size={22} aria-hidden />
      {slot.commentCount > 0 ? (
        <span className="cal-comment-count">
          {slot.commentCount > 99 ? "99" : slot.commentCount}
        </span>
      ) : null}
    </button>
  );
}

/** Availability meter with the electors' avatars INSIDE their segment
 * (QA 2026-08-02): 🟢 people on the green stretch, and so on. The audience
 * is the same on every row of a view, so the meter always fills its column
 * width; avatars link to the person's page. */
function AvailabilityMeter({
  perUser,
  counts,
  slug,
}: {
  perUser: NonNullable<CalendarSlot["perUser"]>;
  counts: { green: number; yellow: number; red: number };
  slug: string;
}) {
  const total = perUser.length;
  if (total === 0) return null;
  const states = ["green", "yellow", "red"] as const;
  return (
    <span className="avail-bar avail-meter" title={countsTitle(counts)}>
      {states.map((state) => {
        const people = perUser.filter((u) => u.state === state);
        if (people.length === 0) return null;
        return (
          <span
            key={state}
            className={`avail-meter-seg ${state[0]}`}
            style={{ width: pct(people.length, total) }}
          >
            {people.map((u) => (
              <Link
                key={u.userId}
                href={`/f/${slug}/${u.userId}`}
                className="cal-person-link"
                aria-label={u.name ?? "Member"}
              >
                <Avatar name={u.name} image={u.image} small />
              </Link>
            ))}
          </span>
        );
      })}
    </span>
  );
}

/** "Author: **Topic**" — both linked to their pages — plus a status pill:
 * "pencilled", or a clickable "register" pill to the event page when
 * confirmed (QA 2026-08-03). Blank when nothing's planned. */
function SessionLine({ slot, slug }: { slot: CalendarSlot; slug: string }) {
  if (!slot.topic) return null;
  const confirmed = slot.status === "confirmed";
  const permalink = topicPath(
    slug,
    null,
    slot.topic.topicSlug,
    slot.topic.hostId,
  );
  return (
    <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
      <span className="cal-session-line">
        <Link href={`/f/${slug}/${slot.topic.hostId}`}>
          {slot.topic.hostName ?? "…"}
        </Link>
        :{" "}
        {permalink ? (
          <Link href={permalink}>
            <strong>{slot.topic.title}</strong>
          </Link>
        ) : (
          <strong>{slot.topic.title}</strong>
        )}
      </span>
      {!confirmed ? (
        <span className="pill" title="Pencilled in — under discussion">
          ✎ pencilled
        </span>
      ) : slot.url ? (
        <a
          className="pill pill-host"
          href={slot.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Register on the event page"
        >
          register <ExternalLink size={12} aria-hidden />
        </a>
      ) : (
        <span className="pill pill-host">confirmed</span>
      )}
    </div>
  );
}

/** "Pencil in a topic…" for an open slot — hosts see their own topics,
 * admins every topic grouped by author (QA 2026-08-03). */
function PencilInControl({
  slot,
  claimTopics,
  admin,
}: {
  slot: CalendarSlot;
  claimTopics: TopicOption[];
  admin: boolean;
}) {
  const { run, busy } = useGqlAction();
  const [topicId, setTopicId] = useState("");
  if (claimTopics.length === 0) return null;

  const groups = new Map<string, TopicOption[]>();
  if (admin) {
    for (const topic of claimTopics) {
      const host = topic.hostName ?? "Unknown host";
      groups.set(host, [...(groups.get(host) ?? []), topic]);
    }
  }
  const option = (t: TopicOption) => (
    <option key={t.id} value={t.id}>
      {t.title}
    </option>
  );

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <select
        aria-label="Pencil in a topic"
        value={topicId}
        onChange={(e) => setTopicId(e.target.value)}
        style={{ width: "auto" }}
      >
        <option value="">Pencil in a topic…</option>
        {admin
          ? [...groups.keys()]
              .sort((a, b) => a.localeCompare(b))
              .map((host) => (
                <optgroup key={host} label={host}>
                  {(groups.get(host) ?? []).map(option)}
                </optgroup>
              ))
          : claimTopics.map(option)}
      </select>
      <button
        type="button"
        className="btn"
        disabled={busy || !topicId}
        onClick={() =>
          void run(
            SET_SESSION,
            { slot: slot.id, topic: topicId, status: "proposed" },
            {
              success: "Pencilled in",
              errorFallback: "Could not pencil in",
              onSuccess: () => setTopicId(""),
            },
          )
        }
      >
        Pencil in
      </button>
    </div>
  );
}

/** Confirm / URL / clear for a slot that carries a session. */
function ActiveSessionControls({
  slot,
  topic,
  perms,
}: {
  slot: CalendarSlot;
  topic: NonNullable<CalendarSlot["topic"]>;
  perms: CalendarPerms;
}) {
  const { run, busy } = useGqlAction();
  const [url, setUrl] = useState(slot.url);
  const confirmed = slot.status === "confirmed";

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {perms.canConfirm || confirmed ? (
        <input
          aria-label="Event page URL"
          placeholder="Event page URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: 220, fontSize: 13 }}
        />
      ) : null}
      {!confirmed && perms.canConfirm ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            void run(
              SET_SESSION,
              { slot: slot.id, topic: topic.id, status: "confirmed", url },
              {
                success: "Session confirmed",
                errorFallback: "Could not confirm",
              },
            )
          }
        >
          Confirm
        </button>
      ) : null}
      {confirmed ? (
        <button
          type="button"
          className="btn"
          disabled={busy || url === slot.url}
          onClick={() =>
            void run(
              SET_SESSION,
              { slot: slot.id, topic: topic.id, status: "confirmed", url },
              { success: "URL saved", errorFallback: "Could not save URL" },
            )
          }
        >
          Save URL
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        onClick={() =>
          void run(
            SET_SESSION,
            { slot: slot.id, topic: null },
            { success: "Slot cleared", errorFallback: "Could not clear" },
          )
        }
      >
        Clear
      </button>
    </div>
  );
}

/** Pencil/confirm/clear controls, shown only to viewers who may touch this
 * slot's session (admins, or hosts while it's open / theirs). */
function SessionControls({
  slot,
  perms,
  claimTopics,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
}) {
  const sessionHostId = slot.topic?.hostId ?? null;
  const mayTouch =
    perms.canAdmin ||
    sessionHostId === null ||
    sessionHostId === perms.viewerId;
  if (!mayTouch || (!perms.canPropose && !perms.canAdmin)) return null;

  return slot.topic ? (
    <ActiveSessionControls slot={slot} topic={slot.topic} perms={perms} />
  ) : (
    <PencilInControl
      slot={slot}
      claimTopics={claimTopics}
      admin={perms.canAdmin}
    />
  );
}

/** Admin-only slot editing (time/location) and deletion. */
function AdminSlotControls({
  slot,
  label,
}: {
  slot: CalendarSlot;
  label: string;
}) {
  const { run, busy } = useGqlAction();
  const [editing, setEditing] = useState(false);
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [start, setStart] = useState(() => toLocal(slot.startsAt));
  const [end, setEnd] = useState(() => toLocal(slot.endsAt));
  const [location, setLocation] = useState(slot.location);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="faint" style={{ fontSize: 11 }}>
          {label}:
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Close editor" : "Edit slot"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ color: "var(--red)" }}
          disabled={busy}
          onClick={() => {
            if (confirm("Delete this timeslot?"))
              void run(
                DELETE_SLOT,
                { slot: slot.id },
                { success: "Slot deleted", errorFallback: "Could not delete" },
              );
          }}
        >
          Delete slot
        </button>
      </div>
      {editing ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            type="datetime-local"
            aria-label="Start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ width: "auto" }}
          />
          <input
            type="datetime-local"
            aria-label="End"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ width: "auto" }}
          />
          <input
            aria-label="Location"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ width: 140 }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy || !start || !end}
            onClick={() =>
              void run(
                UPDATE_SLOT,
                {
                  slot: slot.id,
                  a: new Date(start).toISOString(),
                  b: new Date(end).toISOString(),
                  loc: location,
                },
                {
                  success: "Slot updated",
                  errorFallback: "Could not update slot",
                  onSuccess: () => setEditing(false),
                },
              )
            }
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
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
    <form onSubmit={save} className="inline-form" style={{ marginTop: 4 }}>
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
  onChanged,
}: {
  comment: SlotComment;
  slug: string;
  viewerId: string | null;
  canModerate: boolean;
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
function DiscussionPanel({
  slot,
  slug,
  perms,
  lensTopic,
  comments,
  onReload,
}: {
  slot: CalendarSlot;
  slug: string;
  perms: CalendarPerms;
  /** The page's active topic lens — posting attaches it + the snapshot;
   * "All electors" (null) posts a plain comment (QA 2026-08-03). */
  lensTopic: TopicOption | null;
  comments: SlotComment[] | null;
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
        <div className="inline-form" style={{ marginTop: 4 }}>
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

/** The fold under a slot row: avatars by state, discussion, controls. */
function SlotDetail({
  slot,
  slug,
  perms,
  claimTopics,
  lensTopic,
  adminLabel,
  comments,
  onReload,
}: {
  slot: CalendarSlot;
  slug: string;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel: string;
  comments: SlotComment[] | null;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <DiscussionPanel
        slot={slot}
        slug={slug}
        perms={perms}
        lensTopic={lensTopic}
        comments={comments}
        onReload={onReload}
      />
      <SessionControls slot={slot} perms={perms} claimTopics={claimTopics} />
      {perms.canAdmin ? (
        <AdminSlotControls slot={slot} label={adminLabel} />
      ) : null}
    </div>
  );
}

/** "**Fri 9 Oct** Terrace" over "14:00 – 16:00" (QA 2026-08-02). */
function WhenCell({ slot }: { slot: CalendarSlot }) {
  return (
    <td className="cal-when-cell">
      <div>
        <strong>{formatDate(slot.startsAt)}</strong>
        {slot.location ? <> {slot.location}</> : null}
      </div>
      <div className="faint" style={{ fontSize: 12 }}>
        {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
      </div>
    </td>
  );
}

/** The role-gated right-hand cells: group meter (host/admin), own
 * availability toggle (elector). */
function MeterAndYouCells({
  slot,
  past,
  perms,
  slug,
}: {
  slot: CalendarSlot;
  past: boolean;
  perms: CalendarPerms;
  slug: string;
}) {
  return (
    <>
      {perms.canSeeHostOnly ? (
        <td className="cal-avail-cell">
          {slot.perUser ? (
            <AvailabilityMeter
              perUser={slot.perUser}
              counts={slot.counts}
              slug={slug}
            />
          ) : null}
        </td>
      ) : null}
      {perms.canSetAvailability ? (
        <td className="cal-you-cell">
          {past ? null : (
            <AvailabilityControl
              slotId={slot.id}
              state={slot.viewerState}
              compact
            />
          )}
        </td>
      ) : null}
    </>
  );
}

function SlotTableRow({
  slot,
  past,
  weekStart,
  slug,
  perms,
  claimTopics,
  lensTopic,
  adminLabel,
  columns,
}: {
  slot: CalendarSlot;
  past: boolean;
  /** True when this slot starts a new (Mon-first) week — thicker rule. */
  weekStart: boolean;
  slug: string;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel: string;
  columns: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<SlotComment[] | null>(null);
  const canExpand = perms.canSeeHostOnly || perms.canAdmin;

  async function loadComments() {
    try {
      const data = await clientGql<{ slotComments: SlotComment[] }>(
        COMMENTS_QUERY,
        { id: slot.id },
      );
      setComments(data.slotComments);
    } catch {
      setComments([]);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) await loadComments();
  }

  const rowClasses = [
    past ? "cal-past" : null,
    weekStart ? "cal-week-start" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Fragment>
      <tr className={rowClasses || undefined}>
        <td className="cal-caret-cell">
          {canExpand ? (
            <CommentButton slot={slot} open={open} onToggle={toggle} />
          ) : null}
        </td>
        <WhenCell slot={slot} />
        <MeterAndYouCells slot={slot} past={past} perms={perms} slug={slug} />
      </tr>
      {/* "Author: Topic" + status pill on its own line under the row
          (QA 2026-08-03) — visually part of the same slot block. */}
      {slot.topic ? (
        <tr className={`cal-session-row${past ? " cal-past" : ""}`}>
          <td />
          <td colSpan={columns - 1}>
            <SessionLine slot={slot} slug={slug} />
          </td>
        </tr>
      ) : null}
      {/* Fold indented to the when-column with a hierarchy line on the
          left (QA 2026-08-03). */}
      {open ? (
        <tr className="cal-detail-row">
          <td />
          <td colSpan={columns - 1}>
            <div className="cal-fold">
              <SlotDetail
                slot={slot}
                slug={slug}
                perms={perms}
                claimTopics={claimTopics}
                lensTopic={lensTopic}
                adminLabel={adminLabel}
                comments={comments}
                onReload={loadComments}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/**
 * The calendar as a compact table (QA 2026-07-31 — replaced one card per
 * slot): the 💬 bubble folds a row open into discussion/controls, the
 * full-width availability meter carries avatars inside their 🟢🟡🔴
 * segment, and month headings ride as divider rows.
 */
export function CalendarTable({
  rows,
  slug,
  perms,
  claimTopics,
  lensTopic,
  adminLabel = "Admin",
  showingPast,
  base,
}: {
  rows: CalendarTableRow[];
  slug: string;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel?: string;
  showingPast: boolean;
  base: string;
}) {
  const columns =
    2 + (perms.canSeeHostOnly ? 1 : 0) + (perms.canSetAvailability ? 1 : 0);

  const pastToggle = (
    <Link
      className="topic-body-toggle"
      href={showingPast ? `${base}/calendar` : `${base}/calendar?past=1`}
    >
      {showingPast ? (
        <>
          <ChevronUp size={14} aria-hidden /> Hide past
        </>
      ) : (
        <>
          <ChevronDown size={14} aria-hidden /> Show past
        </>
      )}
    </Link>
  );

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginBottom: 8 }}>
        Calendar
      </h3>
      <div className="table-wrap">
        {/* No header row (QA 2026-08-03) — the columns explain themselves. */}
        <table className="data-table cal-table">
          <tbody>
            {rows.map(({ slot, past }, i) => {
              const month = monthLabel(slot.startsAt);
              const divider =
                i === 0 || month !== monthLabel(rows[i - 1]!.slot.startsAt);
              // Thicker rule between Sunday and Monday (QA 2026-08-02) —
              // skipped when a month heading already breaks the run.
              const weekStart =
                !divider &&
                i > 0 &&
                weekKey(slot.startsAt) !== weekKey(rows[i - 1]!.slot.startsAt);
              return (
                <Fragment key={slot.id}>
                  {divider ? (
                    <tr className="cal-month-row">
                      <td colSpan={columns}>
                        <span className="cal-month-inner">
                          {month}
                          {/* The past toggle rides in the FIRST month
                              break (QA 2026-08-03). */}
                          {i === 0 ? pastToggle : null}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  <SlotTableRow
                    slot={slot}
                    past={past}
                    weekStart={weekStart}
                    slug={slug}
                    perms={perms}
                    claimTopics={claimTopics}
                    lensTopic={lensTopic}
                    adminLabel={adminLabel}
                    columns={columns}
                  />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
