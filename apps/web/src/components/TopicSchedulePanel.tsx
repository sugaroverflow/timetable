"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { clientGql } from "@/lib/clientGraphql";
import type {
  CalendarPerms,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import { CALENDAR_SLOT_FIELDS } from "@/lib/gqlFragments";
import type { RoleLabels } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

import { CalendarTable } from "./CalendarTable";

const QUERY = `query TopicSchedule($s: String!, $t: String!, $past: Boolean) {
  topicSlotFit(idOrSlug: $s, topicId: $t, includePast: $past) {
    hearterCount
    slots { ${CALENDAR_SLOT_FIELDS} }
  }
}`;

const ADD_SESSION = `mutation($slot: String!, $topic: String!) {
  addSlotSession(slotId: $slot, topicId: $topic)
}`;
const CLEAR_SESSION = `mutation($session: String!) {
  clearSlotSession(sessionId: $session)
}`;

type TopicSchedule = { hearterCount: number; slots: CalendarSlot[] };

type SortMode = "date" | "availability";

/** Availability order (Ed, 2026-08-14): 🟢 dominates 🟡 dominates 🔴 —
 * and since every hearter is exactly one of the three, (green, yellow)
 * lexicographic IS the complete ordering; date breaks exact ties. */
function tally(slot: CalendarSlot) {
  return slot.counts ?? { green: 0, yellow: 0, red: 0 };
}

function compareSlots(a: CalendarSlot, b: CalendarSlot, mode: SortMode) {
  if (mode === "availability") {
    const [ac, bc] = [tally(a), tally(b)];
    if (bc.green !== ac.green) return bc.green - ac.green;
    if (bc.yellow !== ac.yellow) return bc.yellow - ac.yellow;
  }
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

function isPast(slot: CalendarSlot): boolean {
  return Date.parse(slot.endsAt) < Date.now();
}

/** This topic's own booking in a slot, if it has one. */
function ownSession(slot: CalendarSlot, topicId: string) {
  return slot.sessions.find((s) => s.topic?.id === topicId) ?? null;
}

/** The workbench's one-click row action: the fast path for the topic this
 * panel is about. The fold underneath still carries the calendar's full
 * controls (confirm, room, URL) — this is the thing you press twenty
 * times while scanning for good dates. */
function PencilAction({
  slot,
  topicId,
  canPencil,
  onDone,
}: {
  slot: CalendarSlot;
  topicId: string;
  canPencil: boolean;
  onDone: () => void;
}) {
  const { run, busy } = useGqlAction();
  const own = ownSession(slot, topicId);
  // A confirmed session is the admins' to undo, and its pill already rides
  // the session line — nothing to offer here.
  if (!canPencil || own?.status === "confirmed") return null;
  if (own) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() =>
          void run(
            CLEAR_SESSION,
            { session: own.id },
            {
              success: "Unpencilled",
              errorFallback: "Could not unpencil",
              onSuccess: onDone,
            },
          )
        }
      >
        Unpencil
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={busy}
      onClick={() =>
        void run(
          ADD_SESSION,
          { slot: slot.id, topic: topicId },
          {
            success: "Pencilled in",
            errorFallback: "Could not pencil in",
            onSuccess: onDone,
          },
        )
      }
    >
      Pencil in
    </button>
  );
}

/** Only the zero-hearters explainer survives — the "Availability of the
 * n ❤️…" helper line is gone (Ed, QA 2026-08-16 round 3); an empty wash
 * still deserves a why. */
function PanelHead({ hearterCount }: { hearterCount: number }) {
  if (hearterCount > 0) return null;
  return (
    <span className="faint" style={{ fontSize: 12 }}>
      No ❤️s yet — the washes fill in as people ❤️ this topic.
    </span>
  );
}

/** The Date/Availability ranking toggle — sits in the controls row under
 * the Calendar heading, since that list is what it sorts (Ed, QA
 * 2026-08-16; moved off the heading itself in round 3). */
function SortToggle({
  mode,
  onMode,
}: {
  mode: SortMode;
  onMode: (mode: SortMode) => void;
}) {
  return (
    <div className="avseg" role="group" aria-label="Sort slots">
      {(["date", "availability"] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={mode === m ? "on" : ""}
          aria-pressed={mode === m}
          onClick={() => onMode(m)}
        >
          {m === "date" ? "By date" : "By availability"}
        </button>
      ))}
    </div>
  );
}

/** Show past / Hide past — a refetch here, since the workbench is a panel
 * rather than a page (the calendar's own toggle is a link, 2026-08-16). */
function PastToggle({
  showPast,
  onToggle,
}: {
  showPast: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="topic-body-toggle" onClick={onToggle}>
      {showPast ? (
        <>
          <ChevronUp size={14} aria-hidden /> Hide past
        </>
      ) : (
        <>
          <ChevronDown size={14} aria-hidden /> Show past
        </>
      )}
    </button>
  );
}

/**
 * topic-workbench (2026-08-14; rebuilt on the calendar's own rows
 * 2026-08-16, decision 10a): the per-topic scheduling pane on My Topics.
 * The rows ARE calendar rows — same washes, session lines, avatar fold,
 * slot chat and session controls — with four things kept local: the wash
 * charts THIS topic's hearters rather than the whole forum, each row
 * carries a one-click pencil for this topic, the list can rank by
 * availability instead of date, and the past is off unless asked for.
 * Rendered inside the topic-tabs Scheduling tab.
 */
export function TopicScheduleBody({
  slug,
  topic,
  perms,
  locations,
  officeHoursLabel,
  adminLabel,
  roleLabels,
}: {
  slug: string;
  /** This topic as a calendar subject: the pencil target, the fold's only
   * claim option, and the lens a comment posted here attaches. */
  topic: TopicOption;
  /** The viewer's calendar permissions, built by the page from their
   * roles exactly as the calendar page builds them. */
  perms: CalendarPerms;
  locations: string[];
  officeHoursLabel: string;
  adminLabel: string;
  roleLabels?: RoleLabels;
}) {
  const [data, setData] = useState<TopicSchedule | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState<SortMode>("date");
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicSlotFit: TopicSchedule | null }>(QUERY, {
      s: slug,
      t: topic.id,
      past: showPast,
    })
      .then((res) => {
        if (!cancelled) setData(res.topicSlotFit);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, topic.id, reloadKey, showPast]);

  if (failed) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Couldn&rsquo;t load the schedule.
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Loading…
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Scheduling isn&rsquo;t available for this topic.
      </div>
    );
  }

  const sorted = [...data.slots].sort((a, b) => compareSlots(a, b, mode));
  // Your own sessions ride at the top as well as staying in place below
  // (Ed, QA 2026-08-15) — upcoming only: the group is what's coming.
  const mine = data.slots
    .filter((s) => !isPast(s) && ownSession(s, topic.id))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const shared = {
    slug,
    locations,
    perms,
    // The panel is one topic's lens: pencilling and claiming from here
    // are about this topic, so the fold's select offers only it.
    claimTopics: [topic],
    lensTopic: topic,
    adminLabel,
    officeHoursLabel,
    roleLabels,
    rowAction: (slot: CalendarSlot) => (
      <PencilAction
        slot={slot}
        topicId={topic.id}
        canPencil={perms.canPropose}
        onDone={() => setReloadKey((k) => k + 1)}
      />
    ),
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <PanelHead hearterCount={data.hearterCount} />
      {mine.length > 0 ? (
        <CalendarTable
          title="Your Sessions"
          card={false}
          collapsible
          rows={mine.map((slot) => ({ slot, past: false }))}
          {...shared}
        />
      ) : null}
      {data.slots.length === 0 ? (
        <div className="faint" style={{ fontSize: 12 }}>
          No slots on the calendar.
        </div>
      ) : (
        <CalendarTable
          title="Calendar"
          card={false}
          collapsible
          // Sort left, Show past right (Ed, QA 2026-08-16 round 3) —
          // .cal-table-controls space-betweens them under the heading.
          controls={
            <>
              <SortToggle mode={mode} onMode={setMode} />
              <PastToggle
                showPast={showPast}
                onToggle={() => setShowPast((p) => !p)}
              />
            </>
          }
          grouped={mode === "date"}
          rows={sorted.map((slot) => ({ slot, past: isPast(slot) }))}
          {...shared}
        />
      )}
    </div>
  );
}
