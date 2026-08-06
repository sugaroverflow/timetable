"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";

import type {
  CalendarPerms,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import { groupTopicsByHost } from "@/lib/calendarTypes";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

const SET_SESSION = `mutation($slot: String!, $topic: String, $sh: String, $status: String, $url: String) {
  setSlotSession(slotId: $slot, topicId: $topic, sessionHostId: $sh, status: $status, url: $url)
}`;
const UPDATE_SLOT = `mutation($slot: String!, $a: String, $b: String, $loc: String) {
  updateTimeslot(slotId: $slot, startsAt: $a, endsAt: $b, location: $loc)
}`;
const DELETE_SLOT = `mutation($slot: String!) { deleteTimeslot(slotId: $slot) }`;

/** "Author: **Topic**" — both linked — or "**Hannah** — Office hours" for
 * topic-less host sessions (QA 2026-08-03), plus a status pill:
 * "pencilled", or a clickable "register" pill to the event page when
 * confirmed. Blank when nothing's planned. Plain row type — the wash,
 * the bold title, and the pill carry the emphasis (the serif heading
 * face predated the row-wash design; type rationalisation 2026-08-06). */
export function SessionLine({
  slot,
  slug,
  officeHoursLabel,
}: {
  slot: CalendarSlot;
  slug: string;
  officeHoursLabel: string;
}) {
  if (!slot.topic && !slot.sessionHost) return null;
  const confirmed = slot.status === "confirmed";
  const permalink = slot.topic
    ? topicPath(slug, null, slot.topic.topicSlug, slot.topic.hostId)
    : null;
  return (
    <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
      {slot.topic ? (
        <span>
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
      ) : (
        <span>
          <Link href={`/f/${slug}/${slot.sessionHost!.id}`}>
            <strong>{slot.sessionHost!.name ?? "…"}</strong>
          </Link>{" "}
          — {officeHoursLabel}
        </span>
      )}
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

/** Choice encoding for the pencil-in/propose selects: a topic id, or
 * "oh:{hostId}" for office hours (QA 2026-08-03). */
export function sessionChoiceVars(
  choice: string,
): { topic: string; sh: null } | { topic: null; sh: string } {
  return choice.startsWith("oh:")
    ? { topic: null, sh: choice.slice(3) }
    : { topic: choice, sh: null };
}

/** Options for the pencil-in/propose selects — hosts see their own topics
 * plus their office hours; admins see every topic grouped by author, with
 * office hours atop each group (QA 2026-08-03). */
export function SessionChoiceOptions({
  claimTopics,
  admin,
  viewerId,
  officeHoursLabel,
}: {
  claimTopics: TopicOption[];
  admin: boolean;
  viewerId: string | null;
  officeHoursLabel: string;
}) {
  const option = (t: TopicOption) => (
    <option key={t.id} value={t.id}>
      {t.title}
    </option>
  );
  if (!admin) {
    return (
      <>
        {viewerId ? (
          <option value={`oh:${viewerId}`}>{officeHoursLabel} (you)</option>
        ) : null}
        {claimTopics.map(option)}
      </>
    );
  }
  const groups = groupTopicsByHost(claimTopics);
  return (
    <>
      {[...groups.keys()].map((host) => {
        const topics = groups.get(host) ?? [];
        return (
          <optgroup key={host} label={host}>
            <option value={`oh:${topics[0]!.hostId}`}>
              {officeHoursLabel} — {host}
            </option>
            {topics.map(option)}
          </optgroup>
        );
      })}
    </>
  );
}

/** "Pencil in…" for an open slot: a topic, or office hours. */
function PencilInControl({
  slot,
  claimTopics,
  perms,
  officeHoursLabel,
}: {
  slot: CalendarSlot;
  claimTopics: TopicOption[];
  perms: CalendarPerms;
  officeHoursLabel: string;
}) {
  const { run, busy } = useGqlAction();
  const [choice, setChoice] = useState("");

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <select
        aria-label="Pencil in a session"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        style={{ width: "auto" }}
      >
        <option value="">Pencil in…</option>
        <SessionChoiceOptions
          claimTopics={claimTopics}
          admin={perms.canAdmin}
          viewerId={perms.viewerId}
          officeHoursLabel={officeHoursLabel}
        />
      </select>
      <button
        type="button"
        className="btn"
        disabled={busy || !choice}
        onClick={() =>
          void run(
            SET_SESSION,
            { slot: slot.id, ...sessionChoiceVars(choice), status: "proposed" },
            {
              success: "Pencilled in",
              errorFallback: "Could not pencil in",
              onSuccess: () => setChoice(""),
            },
          )
        }
      >
        Pencil in
      </button>
    </div>
  );
}

/** Confirm / URL / clear for a slot that carries a session — a topic
 * session or office hours; the mutation keeps whichever subject is set. */
function ActiveSessionControls({
  slot,
  perms,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
}) {
  const { run, busy } = useGqlAction();
  const [url, setUrl] = useState(slot.url);
  const confirmed = slot.status === "confirmed";
  const subject = {
    topic: slot.topic?.id ?? null,
    sh: slot.topic ? null : (slot.sessionHost?.id ?? null),
  };

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {perms.canConfirm || confirmed ? (
        <input
          aria-label="Event page URL"
          placeholder="Event page URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: 220 }}
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
              { slot: slot.id, ...subject, status: "confirmed", url },
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
              { slot: slot.id, ...subject, status: "confirmed", url },
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
            { slot: slot.id, topic: null, sh: null },
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
export function SessionControls({
  slot,
  perms,
  claimTopics,
  officeHoursLabel,
}: {
  slot: CalendarSlot;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  officeHoursLabel: string;
}) {
  const owner = slot.sessionHost?.id ?? slot.topic?.hostId ?? null;
  const mayTouch = perms.canAdmin || owner === null || owner === perms.viewerId;
  if (!mayTouch || (!perms.canPropose && !perms.canAdmin)) return null;

  return slot.topic || slot.sessionHost ? (
    <ActiveSessionControls slot={slot} perms={perms} />
  ) : (
    <PencilInControl
      slot={slot}
      claimTopics={claimTopics}
      perms={perms}
      officeHoursLabel={officeHoursLabel}
    />
  );
}

/** Admin-only slot editing (time/location) and deletion. */
export function AdminSlotControls({
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
        <span className="faint" style={{ fontSize: "var(--text-2xs)" }}>
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
