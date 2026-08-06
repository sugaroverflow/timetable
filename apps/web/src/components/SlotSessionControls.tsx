"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";

import type {
  CalendarPerms,
  CalendarSession,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import { groupTopicsByHost } from "@/lib/calendarTypes";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

const ADD_SESSION = `mutation($slot: String!, $loc: String, $topic: String, $sh: String, $title: String, $url: String) {
  addSlotSession(slotId: $slot, location: $loc, topicId: $topic, sessionHostId: $sh, title: $title, url: $url)
}`;
const UPDATE_SESSION = `mutation($session: String!, $status: String, $url: String) {
  updateSlotSession(sessionId: $session, status: $status, url: $url)
}`;
const CLEAR_SESSION = `mutation($session: String!) {
  clearSlotSession(sessionId: $session)
}`;
const UPDATE_SLOT = `mutation($slot: String!, $a: String, $b: String) {
  updateTimeslot(slotId: $slot, startsAt: $a, endsAt: $b)
}`;
const DELETE_SLOT = `mutation($slot: String!) { deleteTimeslot(slotId: $slot) }`;

/** One booking's line: "Author: **Topic**" (both linked), "**Hannah** —
 * Office hours", or an admin custom title — plus its location and a
 * status pill ("pencilled", or "register"/"confirmed" once confirmed). */
export function SessionLine({
  session,
  slug,
  officeHoursLabel,
}: {
  session: CalendarSession;
  slug: string;
  officeHoursLabel: string;
}) {
  const confirmed = session.status === "confirmed";
  const permalink = session.topic
    ? topicPath(slug, null, session.topic.topicSlug, session.topic.hostId)
    : null;
  return (
    <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
      {session.topic ? (
        <span>
          <Link href={`/f/${slug}/${session.topic.hostId}`}>
            {session.topic.hostName ?? "…"}
          </Link>
          :{" "}
          {permalink ? (
            <Link href={permalink}>
              <strong>{session.topic.title}</strong>
            </Link>
          ) : (
            <strong>{session.topic.title}</strong>
          )}
        </span>
      ) : session.customTitle ? (
        // Admin custom session: no person to link — the register pill
        // carries the event URL once confirmed.
        <span>
          <strong>{session.customTitle}</strong>
        </span>
      ) : (
        <span>
          <Link href={`/f/${slug}/${session.sessionHost!.id}`}>
            <strong>{session.sessionHost!.name ?? "…"}</strong>
          </Link>{" "}
          — {officeHoursLabel}
        </span>
      )}
      {session.location ? (
        <span className="cal-where">{session.location}</span>
      ) : null}
      {!confirmed ? (
        <span className="pill" title="Pencilled in — under discussion">
          ✎ pencilled
        </span>
      ) : session.url ? (
        <a
          className="pill pill-host"
          href={session.url}
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

/** The pencil-in select's custom-event sentinel (admin-only choice). */
const CUSTOM_CHOICE = "custom:";

/** "Pencil in…" — book a session into the slot: a topic, office hours, or
 * (admins) a custom event with its own title and link, at a location the
 * slot doesn't already use. Shown even when the slot has bookings —
 * several sessions can share a time in different locations. */
function PencilInControl({
  slot,
  locations,
  claimTopics,
  perms,
  officeHoursLabel,
}: {
  slot: CalendarSlot;
  /** The forum's configured locations, offered as datalist suggestions. */
  locations: string[];
  claimTopics: TopicOption[];
  perms: CalendarPerms;
  officeHoursLabel: string;
}) {
  const { run, busy } = useGqlAction();
  const [choice, setChoice] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const custom = choice === CUSTOM_CHOICE;

  function pencilVars() {
    return custom
      ? { topic: null, sh: null, title: title.trim(), url: url.trim() || null }
      : sessionChoiceVars(choice);
  }

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <select
        aria-label="Pencil in a session"
        className="cal-pencil-select"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Pencil in…</option>
        <SessionChoiceOptions
          claimTopics={claimTopics}
          admin={perms.canAdmin}
          viewerId={perms.viewerId}
          officeHoursLabel={officeHoursLabel}
        />
        {perms.canAdmin ? (
          <option value={CUSTOM_CHOICE}>Custom event…</option>
        ) : null}
      </select>
      {choice ? (
        <input
          aria-label="Location"
          placeholder="Location"
          list="cal-locations"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{ width: 140 }}
        />
      ) : null}
      {custom ? (
        <>
          <input
            aria-label="Event title"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: 180 }}
          />
          <input
            aria-label="Event link"
            placeholder="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ width: 180 }}
          />
        </>
      ) : null}
      <datalist id="cal-locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <button
        type="button"
        className="btn"
        disabled={busy || !choice || (custom && !title.trim())}
        onClick={() =>
          void run(
            ADD_SESSION,
            { slot: slot.id, loc: location.trim() || null, ...pencilVars() },
            {
              success: "Pencilled in",
              errorFallback: "Could not pencil in",
              onSuccess: () => {
                setChoice("");
                setLocation("");
                setTitle("");
                setUrl("");
              },
            },
          )
        }
      >
        Pencil in
      </button>
    </div>
  );
}

/** Confirm / URL / clear for one booking. */
function ActiveSessionControls({
  session,
  perms,
}: {
  session: CalendarSession;
  perms: CalendarPerms;
}) {
  const { run, busy } = useGqlAction();
  const [url, setUrl] = useState(session.url);
  const confirmed = session.status === "confirmed";

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
              UPDATE_SESSION,
              { session: session.id, status: "confirmed", url },
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
          disabled={busy || url === session.url}
          onClick={() =>
            void run(
              UPDATE_SESSION,
              { session: session.id, url },
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
            CLEAR_SESSION,
            { session: session.id },
            { success: "Session cleared", errorFallback: "Could not clear" },
          )
        }
      >
        Clear
      </button>
    </div>
  );
}

/** Whether the viewer may touch this booking: admins always; the owning
 * host otherwise; custom sessions are admin-only. */
function mayTouchSession(
  session: CalendarSession,
  perms: CalendarPerms,
): boolean {
  if (perms.canAdmin) return true;
  if (session.customTitle) return false;
  const owner = session.sessionHost?.id ?? session.topic?.hostId ?? null;
  return owner !== null && owner === perms.viewerId;
}

/** The fold's session management: per-booking confirm/URL/clear rows
 * (labelled by subject when there are several), plus the pencil-in
 * control — adding another booking never displaces an existing one. */
export function SessionControls({
  slot,
  locations,
  perms,
  claimTopics,
  officeHoursLabel,
}: {
  slot: CalendarSlot;
  locations: string[];
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  officeHoursLabel: string;
}) {
  if (!perms.canPropose && !perms.canAdmin) return null;
  const touchable = slot.sessions.filter((s) => mayTouchSession(s, perms));

  return (
    <>
      {touchable.map((session) => (
        <div key={session.id} className="stack" style={{ gap: 4 }}>
          {slot.sessions.length > 1 ? (
            <span className="faint" style={{ fontSize: "var(--text-2xs)" }}>
              {session.topic?.title ??
                (session.customTitle ||
                  `${session.sessionHost?.name ?? "…"} — ${officeHoursLabel}`)}
              {session.location ? ` · ${session.location}` : ""}
            </span>
          ) : null}
          <ActiveSessionControls session={session} perms={perms} />
        </div>
      ))}
      {perms.canPropose ? (
        <PencilInControl
          slot={slot}
          locations={locations}
          claimTopics={claimTopics}
          perms={perms}
          officeHoursLabel={officeHoursLabel}
        />
      ) : null}
    </>
  );
}

/** Admin-only slot editing (time window) and deletion. */
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
