"use client";

import { Fragment, useEffect, useState } from "react";

import { clientGql } from "@/lib/clientGraphql";
import { useGqlAction } from "@/lib/useGqlAction";

import {
  FoldAvatars,
  tallyStates,
  TintLayer,
  type PerUserAvailability,
} from "./CalendarRowWash";
import { formatTime, monthLabel, weekKey } from "./CalendarTable";

const QUERY = `query TopicSchedule($s: String!, $t: String!) {
  topicSlotFit(idOrSlug: $s, topicId: $t) {
    hearterCount
    slots {
      slotId startsAt endsAt sessionId topicStatus
      counts { green yellow red }
      perUser { userId name image state }
      others { id label status }
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
  others: { id: string; label: string; status: string }[];
};

type TopicSchedule = { hearterCount: number; slots: FitRow[] };

type SortMode = "date" | "availability";

/** Unlike the calendar page (which groups rows under month-year headings),
 * the availability view mixes terms years apart — every date carries its
 * year (QA 2026-08-14). */
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

/** topic-workbench (2026-08-14, demand-first scheduling): the per-topic
 * scheduling pane on My Topics — a mini-calendar of washed datetime rows
 * over THIS topic's hearters (pencils are location-less time-intents; a
 * pencil is the host saying "I am available at this time"), expandable to
 * the hearter avatar fold, with a Date/Availability sort toggle. By date,
 * rows group under month headings with week gaps, exactly like the
 * calendar page (past slots are excluded server-side); by availability
 * the list is flat and ranked. A dashboard only — no comments here.
 * Rendered inside the topic-topic-tabs Scheduling tab. */
export function TopicScheduleBody({
  slug,
  topicId,
  canPencil,
}: {
  slug: string;
  topicId: string;
  /** False under confirmPolicy "admins" (hosts can't pencil): rows stay
   * informative, the pencil buttons hide. */
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
  const grouped = mode === "date";

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
          {sorted.map((row, i) => {
            const divider =
              grouped &&
              (i === 0 ||
                monthLabel(row.startsAt) !==
                  monthLabel(sorted[i - 1]!.startsAt));
            const weekStart =
              grouped &&
              !divider &&
              i > 0 &&
              weekKey(row.startsAt) !== weekKey(sorted[i - 1]!.startsAt);
            return (
              <Fragment key={row.slotId}>
                {divider ? (
                  <div className="cal-month-row">
                    <span className="cal-month-inner">
                      {monthLabel(row.startsAt)}
                    </span>
                  </div>
                ) : null}
                <WorkbenchRow
                  row={row}
                  slug={slug}
                  topicId={topicId}
                  canPencil={canPencil}
                  weekStart={weekStart}
                  showYear={!grouped}
                  onReload={() => setReloadKey((k) => k + 1)}
                />
              </Fragment>
            );
          })}
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
  weekStart,
  showYear,
  onReload,
}: {
  row: FitRow;
  slug: string;
  topicId: string;
  canPencil: boolean;
  weekStart: boolean;
  /** The availability view has no month headings to carry the year. */
  showYear: boolean;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { run, busy } = useGqlAction();
  const when = showYear
    ? formatFitDate(row.startsAt)
    : new Date(row.startsAt).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

  return (
    <div
      className={`cal-row cal-row-expandable${weekStart ? " cal-week-start" : ""}`}
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
            <strong>{when}</strong> {formatTime(row.startsAt)} –{" "}
            {formatTime(row.endsAt)}
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
        {/* Who else is here (QA 2026-08-15): pencils never contend, so this
            is company, not conflict — but a confirmed session here means
            the room race has started. */}
        {row.others.length > 0 ? (
          <div className="cal-row-others">
            {row.others.map((o) => (
              <span key={o.id}>
                <span aria-hidden>{o.status === "confirmed" ? "✓" : "✎"}</span>{" "}
                {o.label}
              </span>
            ))}
          </div>
        ) : null}
        {open ? <FoldAvatars perUser={row.perUser} slug={slug} /> : null}
      </div>
    </div>
  );
}
