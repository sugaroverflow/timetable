"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MapPin,
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

function formatWeekday(iso: string): string {
  return new Date(iso)
    .toLocaleString(undefined, { weekday: "short" })
    .toUpperCase();
}
function formatDay(iso: string): string {
  return String(new Date(iso).getDate());
}
function formatMonth(iso: string): string {
  return new Date(iso)
    .toLocaleString(undefined, { month: "short" })
    .toUpperCase();
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(n: number, total: number): string {
  return total > 0 ? `${(n / total) * 100}%` : "0%";
}

function countsLine(counts: { green: number; yellow: number; red: number }) {
  return (
    <span className="faint" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
      {"🟢"} {counts.green} · {"🟡"} {counts.yellow} · {"🔴"} {counts.red}
    </span>
  );
}

/** Status + topic as one glanceable pill row ("what's happening here"). */
function SessionBadge({ slot }: { slot: CalendarSlot }) {
  if (!slot.topic) {
    return (
      <span className="faint" style={{ fontSize: 13 }}>
        Open
      </span>
    );
  }
  return (
    <span className="row wrap" style={{ gap: 6 }}>
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
        >
          Event page <ExternalLink size={13} aria-hidden />
        </a>
      ) : null}
    </span>
  );
}

/** Host/admin view: audience avatars grouped 🟢 → 🟡 → 🔴. */
function AvatarGroups({
  perUser,
}: {
  perUser: NonNullable<CalendarSlot["perUser"]>;
}) {
  const states = ["green", "yellow", "red"] as const;
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      {states.map((state) => {
        const people = perUser.filter((u) => u.state === state);
        if (people.length === 0) return null;
        return (
          <span key={state} className="row" style={{ gap: 2 }}>
            <span className={`dot ${state}`} aria-label={state} />
            <span className="cal-avatars">
              {people.map((u) => (
                <Avatar key={u.userId} name={u.name} image={u.image} small />
              ))}
            </span>
          </span>
        );
      })}
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
 * fetched by the row when the panel opens and reloaded after a post. */
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

/** Date block + time/location/session on the left, the viewer's own
 * availability control on the right. */
function RowHeader({
  slot,
  perms,
  past,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
  past: boolean;
}) {
  return (
    <div
      className="row wrap"
      style={{ justifyContent: "space-between", alignItems: "flex-start" }}
    >
      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <div className="slot-date">
          <div className="d-wd">{formatWeekday(slot.startsAt)}</div>
          <div className="d-day">{formatDay(slot.startsAt)}</div>
          <div className="d-mo">{formatMonth(slot.startsAt)}</div>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <div className="slot-when">
            {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
          </div>
          {slot.location ? (
            <div className="faint" style={{ fontSize: 13 }}>
              <MapPin size={14} aria-hidden /> {slot.location}
            </div>
          ) : null}
          <SessionBadge slot={slot} />
        </div>
      </div>
      {perms.canSetAvailability && !past ? (
        <span
          className="stack"
          style={{ gap: "var(--space-1)", alignItems: "flex-end" }}
        >
          <span className="faint" style={{ fontSize: 11, fontWeight: 600 }}>
            Your availability
          </span>
          <AvailabilityControl slotId={slot.id} state={slot.viewerState} />
        </span>
      ) : null}
    </div>
  );
}

/** Aggregate bar + counts, plus per-elector avatars for hosts/admins. */
function RowAvailability({
  slot,
  perms,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
}) {
  const total = slot.counts.green + slot.counts.yellow + slot.counts.red;
  return (
    <>
      <div className="row wrap" style={{ gap: "var(--space-2)" }}>
        <span className="avail-bar" style={{ width: 160 }}>
          <span
            className="g"
            style={{ width: pct(slot.counts.green, total) }}
          />
          <span
            className="y"
            style={{ width: pct(slot.counts.yellow, total) }}
          />
          <span className="r" style={{ width: pct(slot.counts.red, total) }} />
        </span>
        {countsLine(slot.counts)}
      </div>
      {perms.canSeeHostOnly && slot.perUser && slot.perUser.length > 0 ? (
        <AvatarGroups perUser={slot.perUser} />
      ) : null}
    </>
  );
}

export function CalendarRow({
  slot,
  perms,
  claimTopics,
  adminLabel = "Admin",
  past = false,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  adminLabel?: string;
  past?: boolean;
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

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && comments === null) await loadComments();
  }

  return (
    <li className={`card stack${past ? " cal-past" : ""}`}>
      <RowHeader slot={slot} perms={perms} past={past} />
      <RowAvailability slot={slot} perms={perms} />

      {canExpand ? (
        <Collapsible.Root
          open={open}
          onOpenChange={(next) => void handleOpenChange(next)}
        >
          <Collapsible.Trigger className="slot-expand">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
            {expandLabel(open, slot.commentCount)}
          </Collapsible.Trigger>
          <Collapsible.Panel>
            {open ? (
              <div className="stack" style={{ gap: 10 }}>
                <DiscussionPanel
                  slot={slot}
                  claimTopics={claimTopics}
                  comments={comments}
                  onReload={loadComments}
                />
                <SessionControls
                  slot={slot}
                  perms={perms}
                  claimTopics={claimTopics}
                />
                {perms.canAdmin ? (
                  <AdminSlotControls slot={slot} label={adminLabel} />
                ) : null}
              </div>
            ) : null}
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
    </li>
  );
}

function expandLabel(open: boolean, commentCount: number): string {
  const label = open ? "Hide discussion" : "Discussion & host chat";
  if (commentCount === 0) return label;
  return `${label} · ${commentCount} message${commentCount === 1 ? "" : "s"}`;
}
