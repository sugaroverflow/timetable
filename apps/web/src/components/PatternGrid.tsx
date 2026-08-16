"use client";

import { useState } from "react";

import { patternCellKey, type CalendarPatternCell } from "@timetable/shared";

import type { AvailabilityState } from "@/lib/calendarTypes";
import { useGqlAction } from "@/lib/useGqlAction";

const SAVE = `mutation($s: String!, $cells: String!) {
  setMyAvailabilityPattern(idOrSlug: $s, cellsJson: $cells)
}`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CYCLE: AvailabilityState[] = ["yellow", "green", "red"];
const ICON: Record<AvailabilityState, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};
const WORD: Record<AvailabilityState, string> = {
  green: "available",
  yellow: "maybe",
  red: "can’t",
};

/**
 * The elector's weekly availability template (calendar v2). The grid IS the
 * forum's slot pattern — electors answer exactly the cells sessions can
 * happen in. Every click cycles maybe → available → can’t and saves; slots
 * without an explicit per-slot answer inherit from here.
 */
export function PatternGrid({
  slug,
  cells,
  initial,
}: {
  slug: string;
  cells: CalendarPatternCell[];
  initial: Record<string, AvailabilityState>;
}) {
  const { run, busy } = useGqlAction();
  const [states, setStates] =
    useState<Record<string, AvailabilityState>>(initial);

  function cycle(cell: CalendarPatternCell) {
    const key = patternCellKey(cell);
    const current = states[key] ?? "yellow";
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
    const nextStates = { ...states, [key]: next };
    setStates(nextStates);
    void run(
      SAVE,
      { s: slug, cells: JSON.stringify(nextStates) },
      {
        success: `${WEEKDAYS[cell.weekday]} ${cell.start} set to “${WORD[next]}”`,
        errorFallback: "Could not save your pattern",
      },
    );
  }

  const sorted = [...cells].sort(
    (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
  );

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginBottom: 10 }}>
        Your weekly pattern
      </h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Tap a time to cycle 🟡 maybe → 🟢 available → 🔴 can’t. Slots you
        haven’t answered individually use this — we use whatever availability
        information you share.
      </p>
      <div className="weekday-grid">
        {sorted.map((cell) => {
          const key = patternCellKey(cell);
          const state = states[key] ?? "yellow";
          return (
            <button
              key={key}
              type="button"
              className={`avail-btn ${state} on`}
              style={{ width: "auto", padding: "0 10px" }}
              disabled={busy}
              onClick={() => cycle(cell)}
            >
              {WEEKDAYS[cell.weekday]} {cell.start}–{cell.end} {ICON[state]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
