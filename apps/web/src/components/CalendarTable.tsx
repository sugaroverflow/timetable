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
import { useGqlAction } from "@/lib/useGqlAction";

import { Avatar } from "./Avatar";
import { AvailabilityControl } from "./AvailabilityControl";

const SET_SESSION = `mutation($slot: String!, $topic: String, $status: String, $url: String) {
  setSlotSession(slotId: $slot, topicId: $topic, status: $status, url: $url)
}`;
const UPDATE_SLOT = `mutation($slot: String!, $a: String, $b: String, $loc: String) {
  updateTimeslot(slotId: $slot, startsAt: $a, endsAt: $b, location: $loc)
}`;
const DELETE_SLOT = `mutation($slot: String!) { deleteTimeslot(slotId: $slot) }`;
const COMMENTS_QUERY = `query($id: String!) {
  slotComments(slotId: $id) {
    id authorName authorImage body topicTitle createdAt
    counts { green yellow red }
  }
}`;
const ADD_COMMENT = `mutation($id: String!, $body: String!, $topic: String) {
  addSlotComment(slotId: $id, body: $body, topicId: $topic) { id }
}`;

type SlotComment = {
  id: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  topicTitle: string | null;
  counts: { green: number; yellow: number; red: number } | null;
  createdAt: string;
};

/** A slot plus its server-computed pastness (kept out of render for the
 * react purity rule). */
export type CalendarTableRow = { slot: CalendarSlot; past: boolean };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
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
      className="cal-comment-btn"
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
 * (QA 2026-08-02): 🟢 people on the green stretch, and so on. Length still
 * tracks the audience size; hover an avatar for the name. */
function AvailabilityMeter({
  perUser,
  counts,
}: {
  perUser: NonNullable<CalendarSlot["perUser"]>;
  counts: { green: number; yellow: number; red: number };
}) {
  const total = perUser.length;
  if (total === 0) return null;
  const states = ["green", "yellow", "red"] as const;
  // ~20px per person: 26px avatars overlapping 6px inside each segment.
  const width = Math.max(48, Math.min(total * 20, 440));
  return (
    <span
      className="avail-bar avail-meter"
      style={{ width }}
      title={countsTitle(counts)}
    >
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
              <Avatar key={u.userId} name={u.name} image={u.image} small />
            ))}
          </span>
        );
      })}
    </span>
  );
}

/** Status + topic as one glanceable pill; blank when nothing's planned
 * (QA 2026-08-02 — "Open" read as noise). */
function SessionBadge({ slot }: { slot: CalendarSlot }) {
  if (!slot.topic) return null;
  return (
    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
      <span
        className={`pill ${slot.status === "confirmed" ? "pill-host" : ""}`}
        title={slot.status === "confirmed" ? "Confirmed" : "Pencilled in"}
      >
        {slot.status === "confirmed" ? "Confirmed" : "✎ Pencilled"}:{" "}
        {slot.topic.title}
      </span>
      {slot.url ? (
        <a
          href={slot.url}
          target="_blank"
          rel="noopener noreferrer"
          className="row"
          style={{ gap: 4, fontSize: 13 }}
          title="Event page"
          aria-label="Event page"
        >
          <ExternalLink size={13} aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

/** "Pencil in a topic…" for an open slot. */
function PencilInControl({
  slot,
  claimTopics,
}: {
  slot: CalendarSlot;
  claimTopics: TopicOption[];
}) {
  const { run, busy } = useGqlAction();
  const [topicId, setTopicId] = useState("");
  if (claimTopics.length === 0) return null;

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <select
        aria-label="Pencil in a topic"
        value={topicId}
        onChange={(e) => setTopicId(e.target.value)}
        style={{ width: "auto" }}
      >
        <option value="">Pencil in a topic…</option>
        {claimTopics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
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
    <PencilInControl slot={slot} claimTopics={claimTopics} />
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

/** One comment; a session claim renders its topic + frozen snapshot chip. */
function CommentRow({ comment }: { comment: SlotComment }) {
  return (
    <div className="hc">
      <Avatar name={comment.authorName} image={comment.authorImage} small />
      <div>
        <div className="hc-name">{comment.authorName ?? "Someone"}</div>
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
      </div>
    </div>
  );
}

/** The discussion thread + claim composer (host/admin only). Comments are
 * fetched by the row when it unfolds and reloaded after a post. */
function DiscussionPanel({
  slot,
  claimTopics,
  comments,
  onReload,
}: {
  slot: CalendarSlot;
  claimTopics: TopicOption[];
  comments: SlotComment[] | null;
  onReload: () => Promise<void>;
}) {
  const { run, busy } = useGqlAction();
  const [body, setBody] = useState("");
  const [claimTopicId, setClaimTopicId] = useState("");

  function selectClaim(topicId: string) {
    setClaimTopicId(topicId);
    const topic = claimTopics.find((t) => t.id === topicId);
    if (topic && !body.trim()) {
      setBody(`I'd like to book this for a session on ${topic.title}.`);
    }
  }

  function post(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      ADD_COMMENT,
      { id: slot.id, body: text, topic: claimTopicId || null },
      {
        errorFallback: "Could not post",
        onSuccess: async () => {
          setBody("");
          setClaimTopicId("");
          await onReload();
        },
      },
    );
  }

  return (
    <div className="host-thread">
      {comments?.map((c) => (
        <CommentRow key={c.id} comment={c} />
      ))}
      {comments && comments.length === 0 ? (
        <div className="faint" style={{ fontSize: 12, padding: "4px 0" }}>
          No messages yet.
        </div>
      ) : null}
      <form onSubmit={post} className="stack" style={{ gap: 6 }}>
        <div className="hc" style={{ alignItems: "flex-start" }}>
          <Avatar name={null} small />
          <div style={{ flex: 1, display: "flex", gap: 8 }}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add to the discussion…"
              aria-label="Slot message"
              style={{ flex: 1, minHeight: 38 }}
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
        </div>
        {claimTopics.length > 0 ? (
          <div className="row wrap" style={{ gap: 6, paddingLeft: 34 }}>
            <select
              aria-label="Attach a topic claim"
              value={claimTopicId}
              onChange={(e) => selectClaim(e.target.value)}
              style={{ width: "auto", fontSize: 12 }}
            >
              <option value="">No topic attached</option>
              {claimTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  Claim for: {t.title}
                </option>
              ))}
            </select>
            {claimTopicId ? (
              <span className="faint" style={{ fontSize: 12 }}>
                The current 🟢🟡🔴 counts for this topic’s ❤️s will be attached.
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}

/** The fold under a slot row: avatars by state, discussion, controls. */
function SlotDetail({
  slot,
  perms,
  claimTopics,
  adminLabel,
  comments,
  onReload,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  adminLabel: string;
  comments: SlotComment[] | null;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <DiscussionPanel
        slot={slot}
        claimTopics={claimTopics}
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

function SlotTableRow({
  slot,
  past,
  weekStart,
  perms,
  claimTopics,
  adminLabel,
  columns,
}: {
  slot: CalendarSlot;
  past: boolean;
  /** True when this slot starts a new (Mon-first) week — thicker rule. */
  weekStart: boolean;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
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
        <td className="cal-when-cell">
          <strong>{formatDate(slot.startsAt)}</strong>{" "}
          <span>
            {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
          </span>
          {slot.location ? (
            <div className="faint" style={{ fontSize: 12 }}>
              {slot.location}
            </div>
          ) : null}
          {/* Pencilled/confirmed pill rides under the when/where instead
              of its own column (QA 2026-08-02). */}
          <SessionBadge slot={slot} />
        </td>
        {perms.canSeeHostOnly ? (
          <td>
            {slot.perUser ? (
              <AvailabilityMeter perUser={slot.perUser} counts={slot.counts} />
            ) : null}
          </td>
        ) : null}
        {perms.canSetAvailability ? (
          <td>
            {past ? null : (
              <AvailabilityControl
                slotId={slot.id}
                state={slot.viewerState}
                compact
              />
            )}
          </td>
        ) : null}
      </tr>
      {open ? (
        <tr className="cal-detail-row">
          <td colSpan={columns}>
            <SlotDetail
              slot={slot}
              perms={perms}
              claimTopics={claimTopics}
              adminLabel={adminLabel}
              comments={comments}
              onReload={loadComments}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/**
 * The calendar as a compact table (QA 2026-07-31 — replaced one card per
 * slot): caret column folds open into avatars/discussion/controls, the
 * availability bar's LENGTH tracks the audience size so lens switches are
 * visible, and month headings ride as divider rows.
 */
export function CalendarTable({
  rows,
  perms,
  claimTopics,
  adminLabel = "Admin",
  showingPast,
  base,
}: {
  rows: CalendarTableRow[];
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  adminLabel?: string;
  showingPast: boolean;
  base: string;
}) {
  const columns =
    2 + (perms.canSeeHostOnly ? 1 : 0) + (perms.canSetAvailability ? 1 : 0);

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="data-table cal-table">
          <thead>
            <tr>
              <th aria-label="Discussion" />
              <th>When</th>
              {/* Group availability is host/admin-only (QA 2026-08-02). */}
              {perms.canSeeHostOnly ? <th>Availability</th> : null}
              {perms.canSetAvailability ? <th>You</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr className="cal-past-row">
              <td colSpan={columns}>
                <Link
                  className="topic-body-toggle"
                  href={
                    showingPast ? `${base}/calendar` : `${base}/calendar?past=1`
                  }
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
              </td>
            </tr>
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
                      <td colSpan={columns}>{month}</td>
                    </tr>
                  ) : null}
                  <SlotTableRow
                    slot={slot}
                    past={past}
                    weekStart={weekStart}
                    perms={perms}
                    claimTopics={claimTopics}
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
