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

const ADD_SESSION = `mutation($slot: String!, $topic: String, $sh: String, $title: String, $url: String) {
  addSlotSession(slotId: $slot, topicId: $topic, sessionHostId: $sh, title: $title, url: $url)
}`;
const UPDATE_SESSION = `mutation($session: String!, $status: String, $url: String, $loc: String) {
  updateSlotSession(sessionId: $session, status: $status, url: $url, location: $loc)
}`;
const CLEAR_SESSION = `mutation($session: String!) {
  clearSlotSession(sessionId: $session)
}`;
const UPDATE_SLOT = `mutation($slot: String!, $a: String, $b: String, $locs: String) {
  updateTimeslot(slotId: $slot, startsAt: $a, endsAt: $b, locationsJson: $locs)
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
 * (admins) a custom event with its own title and link. Pencilling is a
 * location-less time-intent (2026-08-14) — the room is decided at confirm
 * time — so any number of subjects can share a slot. */
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
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const custom = choice === CUSTOM_CHOICE;

  function pencilVars() {
    return custom
      ? { topic: null, sh: null, title: title.trim(), url: url.trim() || null }
      : sessionChoiceVars(choice);
  }

  return (
    // Full-width row matching the comments composer: the select flexes so
    // {dropdown, Pencil in} span the column exactly (QA 2026-08-10).
    <div className="row wrap cal-controls-row" style={{ gap: 8 }}>
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
      {custom ? (
        <>
          <input
            aria-label="Event title"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            aria-label="Event link"
            placeholder="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </>
      ) : null}
      <button
        type="button"
        className="btn"
        disabled={busy || !choice || (custom && !title.trim())}
        onClick={() =>
          void run(
            ADD_SESSION,
            { slot: slot.id, ...pencilVars() },
            {
              success: "Pencilled in",
              errorFallback: "Could not pencil in",
              onSuccess: () => {
                setChoice("");
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

/** The confirm-time room picker: a select over the slot's offered
 * locations — options another confirmed session already holds are
 * disabled — or free text with the forum-locations datalist when the slot
 * offers none. (Forums with no locations at all never render this.) */
function SessionLocationPicker({
  offered,
  taken,
  locations,
  datalistId,
  location,
  onChange,
}: {
  offered: string[];
  taken: Set<string>;
  locations: string[];
  datalistId: string;
  location: string;
  onChange: (location: string) => void;
}) {
  if (offered.length > 0) {
    return (
      <select
        aria-label="Location"
        value={location}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "auto" }}
      >
        <option value="">Location…</option>
        {offered.map((l) => (
          <option key={l} value={l} disabled={taken.has(l)}>
            {l}
            {taken.has(l) ? " (taken)" : ""}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <input
        aria-label="Location"
        placeholder="Location"
        list={datalistId}
        value={location}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 160 }}
      />
      <datalist id={datalistId}>
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </>
  );
}

/** Nothing to save — the inputs match the booking as stored. */
function sessionUnchanged(
  session: CalendarSession,
  url: string,
  location: string,
): boolean {
  return url === session.url && location === session.location;
}

/** Confirm / URL / location / clear for one booking. The room is decided
 * at confirm time (2026-08-14): confirming picks a free location (exactly
 * one free offered option preselects); forums with no locations at all
 * have no picker. Once confirmed, the location stays editable alongside
 * the URL under one Save. */
function ActiveSessionControls({
  session,
  slot,
  locations,
  perms,
}: {
  session: CalendarSession;
  slot: CalendarSlot;
  /** The forum's configured locations — free-text suggestions when the
   * slot has no offered set of its own. */
  locations: string[];
  perms: CalendarPerms;
}) {
  const { run, busy } = useGqlAction();
  const confirmed = session.status === "confirmed";
  const offered = slot.locations;
  // Rooms held by ANOTHER confirmed session in this slot — confirmed
  // sessions are exclusive per (slot, location).
  const taken = new Set(
    slot.sessions
      .filter((s) => s.status === "confirmed" && s.id !== session.id)
      .map((s) => s.location)
      .filter(Boolean),
  );
  const free = offered.filter((l) => !taken.has(l));
  const [url, setUrl] = useState(session.url);
  const [location, setLocation] = useState(
    () => session.location || (free.length === 1 ? free[0]! : ""),
  );
  const canEdit = perms.canConfirm || confirmed;
  const showPicker = canEdit && offered.length + locations.length > 0;
  const needsLocation = offered.length > 0 && !location;
  const datalistId = `cal-locations-${session.id}`;
  // null = unchanged when there is no picker to change anything with.
  const locationVar = showPicker ? location.trim() : null;
  const confirmNow = () =>
    void run(
      UPDATE_SESSION,
      { session: session.id, status: "confirmed", url, loc: locationVar },
      { success: "Session confirmed", errorFallback: "Could not confirm" },
    );
  const save = () =>
    void run(
      UPDATE_SESSION,
      { session: session.id, url, loc: locationVar },
      { success: "Saved", errorFallback: "Could not save" },
    );
  const unchanged = sessionUnchanged(session, url, location);

  return (
    // Full-width row matching the comments composer: the URL input flexes
    // and {input, picker, Confirm/Save, Clear} span the column
    // (QA 2026-08-10).
    <div className="row wrap cal-controls-row" style={{ gap: 8 }}>
      {canEdit ? (
        <input
          aria-label="Event page URL"
          placeholder="Event page URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      ) : null}
      {showPicker ? (
        <SessionLocationPicker
          offered={offered}
          taken={taken}
          locations={locations}
          datalistId={datalistId}
          location={location}
          onChange={setLocation}
        />
      ) : null}
      {!confirmed && perms.canConfirm ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || needsLocation}
          onClick={confirmNow}
        >
          Confirm
        </button>
      ) : null}
      {confirmed ? (
        <button
          type="button"
          className="btn"
          disabled={busy || unchanged}
          onClick={save}
        >
          Save
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
      {/* Pencil-in sits ABOVE the per-booking URL rows (QA 2026-08-10). */}
      {perms.canPropose ? (
        <PencilInControl
          slot={slot}
          claimTopics={claimTopics}
          perms={perms}
          officeHoursLabel={officeHoursLabel}
        />
      ) : null}
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
          <ActiveSessionControls
            session={session}
            slot={slot}
            locations={locations}
            perms={perms}
          />
        </div>
      ))}
    </>
  );
}

/** Admin-only slot editing (time window, offered locations) and deletion. */
export function AdminSlotControls({
  slot,
  locations = [],
  label,
}: {
  slot: CalendarSlot;
  /** The forum's configured locations (edit options beside the slot's own). */
  locations?: string[];
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
  // Configured locations first, then any extras this slot already carries.
  const options = [
    ...locations,
    ...slot.locations.filter((l) => !locations.includes(l)),
  ];
  const [where, setWhere] = useState<Set<string>>(
    () => new Set(slot.locations),
  );
  const needsLocation = options.length > 0 && where.size === 0;

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
        <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
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
          {options.map((loc) => (
            <label
              key={loc}
              className="row"
              style={{ gap: 3, fontSize: 12, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={where.has(loc)}
                onChange={(e) => {
                  const next = new Set(where);
                  if (e.target.checked) next.add(loc);
                  else next.delete(loc);
                  setWhere(next);
                }}
              />
              {loc}
            </label>
          ))}
          <button
            type="button"
            className="btn"
            disabled={busy || !start || !end || needsLocation}
            onClick={() =>
              void run(
                UPDATE_SLOT,
                {
                  slot: slot.id,
                  a: new Date(start).toISOString(),
                  b: new Date(end).toISOString(),
                  locs:
                    options.length > 0
                      ? JSON.stringify(options.filter((l) => where.has(l)))
                      : null,
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
