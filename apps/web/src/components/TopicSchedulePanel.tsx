"use client";

import { useEffect, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";

import { clientGql } from "@/lib/clientGraphql";
import { useGqlAction } from "@/lib/useGqlAction";

import {
  FoldAvatars,
  tallyStates,
  TintLayer,
  type PerUserAvailability,
} from "./CalendarRowWash";
import { formatTime } from "./CalendarTable";

const QUERY = `query TopicSchedule($s: String!, $t: String!) {
  topicSlotFit(idOrSlug: $s, topicId: $t) {
    hearterCount
    slots {
      slotId startsAt endsAt sessionId topicStatus
      counts { green yellow red }
      perUser { userId name image state }
    }
  }
}`;

const ADD_SESSION = `mutation($slot: String!, $topic: String!) {
  addSlotSession(slotId: $slot, topicId: $topic)
}`;
const CLEAR_SESSION = `mutation($session: String!) {
  clearSlotSession(sessionId: $session)
}`;

type FitRow = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  sessionId: string | null;
  topicStatus: "proposed" | "confirmed" | null;
  counts: { green: number; yellow: number; red: number };
  perUser: PerUserAvailability[];
};

type TopicSchedule = { hearterCount: number; slots: FitRow[] };

type SortMode = "date" | "availability";

/** Unlike the calendar page (which groups rows under month-year headings),
 * this list mixes terms years apart once sorted by availability — every
 * date carries its year (QA 2026-08-14). */
function formatFitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Availability order (Ed, 2026-08-14): 🟢 dominates 🟡 dominates 🔴 —
 * and since every hearter is exactly one of the three, (green, yellow)
 * lexicographic IS the complete ordering; date breaks exact ties. */
function compareRows(a: FitRow, b: FitRow, mode: SortMode): number {
  if (mode === "availability") {
    if (b.counts.green !== a.counts.green)
      return b.counts.green - a.counts.green;
    if (b.counts.yellow !== a.counts.yellow) {
      return b.counts.yellow - a.counts.yellow;
    }
  }
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

/** True when a click landed on an interactive element that owns the event
 * (the pencil/unpencil buttons) — same guard as the calendar rows. */
function onInteractive(e: { target: EventTarget | null }): boolean {
  return Boolean(
    (e.target as HTMLElement | null)?.closest(
      "a,button,input,select,textarea,label",
    ),
  );
}

/** topic-workbench v2 (2026-08-14, demand-first scheduling): the per-topic
 * scheduling panel on My Topics as a mini-calendar — one washed row per
 * datetime (pencils are location-less time-intents; a pencil is the host
 * saying "I am available at this time"), expandable to the hearter avatar
 * fold, with a Date/Availability sort toggle. A dashboard only: no
 * comments here — discussion happens on the calendar page. */
export function TopicSchedulePanel({
  slug,
  topicId,
  canPencil,
  calendarEnabled,
  topicStatus,
}: {
  slug: string;
  topicId: string;
  /** False under confirmPolicy "admins" (hosts can't pencil): rows stay
   * informative, the pencil buttons hide. */
  canPencil: boolean;
  /** The panel self-gates (keeps TopicManager's complexity budget flat):
   * calendar on + published topics only. */
  calendarEnabled: boolean;
  topicStatus: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!calendarEnabled || topicStatus !== "published") return null;
  return (
    <Collapsible.Root
      className="host-panel"
      open={expanded}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger className="host-panel-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        <CalendarDays size={14} aria-hidden /> Scheduling
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {expanded && (
          <TopicScheduleBody
            slug={slug}
            topicId={topicId}
            canPencil={canPencil}
          />
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function TopicScheduleBody({
  slug,
  topicId,
  canPencil,
}: {
  slug: string;
  topicId: string;
  canPencil: boolean;
}) {
  const [data, setData] = useState<TopicSchedule | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState<SortMode>("date");

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicSlotFit: TopicSchedule | null }>(QUERY, {
      s: slug,
      t: topicId,
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
  }, [slug, topicId, reloadKey]);

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

  const sorted = [...data.slots].sort((a, b) => compareRows(a, b, mode));

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className="row wrap"
        style={{
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="faint" style={{ fontSize: 12 }}>
          {data.hearterCount === 0
            ? "No ❤️s yet — the washes fill in as people ❤️ this topic."
            : `Availability of the ${data.hearterCount} ❤️ on this topic. Pencil in every time you could run it.`}
        </span>
        <div className="avseg" role="group" aria-label="Sort slots">
          {(["date", "availability"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? "on" : ""}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m === "date" ? "By date" : "By availability"}
            </button>
          ))}
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="faint" style={{ fontSize: 12 }}>
          No upcoming slots on the calendar.
        </div>
      ) : (
        <div className="cal-list">
          {sorted.map((row) => (
            <WorkbenchRow
              key={row.slotId}
              row={row}
              slug={slug}
              topicId={topicId}
              canPencil={canPencil}
              onReload={() => setReloadKey((k) => k + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One washed datetime row, calendar-style: the tint IS the availability
 * chart; clicking the row folds open the hearter avatars (the accordion);
 * the right cluster is the pencil state/action. */
function WorkbenchRow({
  row,
  slug,
  topicId,
  canPencil,
  onReload,
}: {
  row: FitRow;
  slug: string;
  topicId: string;
  canPencil: boolean;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { run, busy } = useGqlAction();

  return (
    <div
      className="cal-row cal-row-expandable"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => {
        if (!onInteractive(e)) setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        setOpen((o) => !o);
      }}
    >
      <div className="cal-row-head">
        <TintLayer
          counts={row.counts}
          avatarCounts={open ? tallyStates(row.perUser) : null}
        />
        <div className="cal-row-line">
          <span className="cal-when">
            <strong>{formatFitDate(row.startsAt)}</strong>{" "}
            {formatTime(row.startsAt)} – {formatTime(row.endsAt)}
          </span>
          <span className="cal-row-right">
            {row.topicStatus === "confirmed" ? (
              <span className="pill pill-host">confirmed</span>
            ) : row.topicStatus === "proposed" ? (
              <>
                <span className="pill" title="Pencilled in — under discussion">
                  ✎ pencilled
                </span>
                {canPencil && row.sessionId ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        CLEAR_SESSION,
                        { session: row.sessionId },
                        {
                          success: "Unpencilled",
                          errorFallback: "Could not unpencil",
                          onSuccess: onReload,
                        },
                      )
                    }
                  >
                    Unpencil
                  </button>
                ) : null}
              </>
            ) : canPencil ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(
                    ADD_SESSION,
                    { slot: row.slotId, topic: topicId },
                    {
                      success: "Pencilled in",
                      errorFallback: "Could not pencil in",
                      onSuccess: onReload,
                    },
                  )
                }
              >
                Pencil in
              </button>
            ) : null}
          </span>
        </div>
        {open ? <FoldAvatars perUser={row.perUser} slug={slug} /> : null}
      </div>
    </div>
  );
}
