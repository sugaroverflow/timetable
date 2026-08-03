"use client";

import { useState } from "react";
import { X } from "lucide-react";

import {
  patternCellKey,
  type CalendarPatternCell,
  type CalendarSettings,
  type CalendarTerm,
} from "@timetable/shared";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { pluralLabel } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const SAVE_AND_NOOP = `mutation($s: String!, $cal: String!) {
  updateForumSettings(idOrSlug: $s, calendarJson: $cal) { id }
}`;
const SAVE_AND_GENERATE = `mutation($s: String!, $cal: String!, $slots: String!) {
  updateForumSettings(idOrSlug: $s, calendarJson: $cal) { id }
  createTimeslots(idOrSlug: $s, slotsJson: $slots)
}`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Mon-first ordering for the weekday picker.
const PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0];

function cellLabel(cell: CalendarPatternCell): string {
  return `${WEEKDAYS[cell.weekday]} ${cell.start}–${cell.end}`;
}

/** Local YYYY-MM-DD for a Date (generation runs on the admin's clock). */
function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Pattern × terms → concrete slots, computed in the ADMIN'S browser
 * timezone (slots are stored UTC; there is no forum-timezone setting yet).
 * Each generated slot carries its cellKey so elector patterns can infer. */
function computeSlots(
  cells: CalendarPatternCell[],
  terms: CalendarTerm[],
): { startsAt: string; endsAt: string; cellKey: string }[] {
  const slots: { startsAt: string; endsAt: string; cellKey: string }[] = [];
  for (const term of terms) {
    const end = new Date(`${term.end}T00:00:00`);
    for (
      const day = new Date(`${term.start}T00:00:00`);
      day <= end;
      day.setDate(day.getDate() + 1)
    ) {
      for (const cell of cells) {
        if (day.getDay() !== cell.weekday) continue;
        const date = ymd(day);
        slots.push({
          startsAt: new Date(`${date}T${cell.start}:00`).toISOString(),
          endsAt: new Date(`${date}T${cell.end}:00`).toISOString(),
          cellKey: patternCellKey(cell),
        });
      }
    }
  }
  return slots;
}

function AddCellForm({
  onAdd,
}: {
  onAdd: (cells: CalendarPatternCell[]) => void;
}) {
  const [days, setDays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("21:00");

  return (
    <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
      {PICKER_ORDER.map((wd) => (
        <label
          key={wd}
          className="row"
          style={{ gap: 3, fontSize: 12, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={days.has(wd)}
            onChange={(e) => {
              const next = new Set(days);
              if (e.target.checked) next.add(wd);
              else next.delete(wd);
              setDays(next);
            }}
          />
          {WEEKDAYS[wd]}
        </label>
      ))}
      <input
        type="time"
        aria-label="Start time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        style={{ width: "auto" }}
      />
      <span className="faint">–</span>
      <input
        type="time"
        aria-label="End time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        style={{ width: "auto" }}
      />
      <button
        type="button"
        className="btn"
        disabled={days.size === 0 || !start || !end || end <= start}
        onClick={() => {
          onAdd(
            PICKER_ORDER.filter((wd) => days.has(wd)).map((weekday) => ({
              weekday,
              start,
              end,
            })),
          );
          setDays(new Set());
        }}
      >
        Add times
      </button>
    </div>
  );
}

function AddTermForm({ onAdd }: { onAdd: (term: CalendarTerm) => void }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  return (
    <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
      <input
        aria-label="Dates name"
        placeholder="Name (e.g. Autumn term)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: 180 }}
      />
      <input
        type="date"
        aria-label="First day"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        style={{ width: "auto" }}
      />
      <span className="faint">–</span>
      <input
        type="date"
        aria-label="Last day"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        style={{ width: "auto" }}
      />
      <button
        type="button"
        className="btn"
        disabled={!start || !end || end < start}
        onClick={() => {
          onAdd({ name: name.trim() || "Dates", start, end });
          setName("");
          setStart("");
          setEnd("");
        }}
      >
        Add dates
      </button>
    </div>
  );
}

/**
 * Admin setup card (calendar v2): the schedule as pattern × terms, with a
 * consequence-preview sentence before anything is saved. Generation is
 * idempotent — identical existing slots are skipped server-side — so
 * re-generating after adding a term or cell is safe.
 */
export function CalendarSetup({
  slug,
  current,
  adminLabel = "Admin",
}: {
  slug: string;
  current: CalendarSettings;
  adminLabel?: string;
}) {
  const { run, busy } = useGqlAction();
  const [cells, setCells] = useState<CalendarPatternCell[]>(
    current.patternCells ?? [],
  );
  const [terms, setTerms] = useState<CalendarTerm[]>(current.terms ?? []);

  const slots = computeSlots(cells, terms);
  const cellSummary = cells.map(cellLabel).join(", ");

  function save() {
    const cal = JSON.stringify({ patternCells: cells, terms });
    if (slots.length === 0) {
      void run(
        SAVE_AND_NOOP,
        { s: slug, cal },
        { success: "Pattern saved", errorFallback: "Could not save" },
      );
      return;
    }
    void run(
      SAVE_AND_GENERATE,
      { s: slug, cal, slots: JSON.stringify(slots) },
      {
        success: (data) => {
          const created = (data as { createTimeslots?: number })
            .createTimeslots;
          return created === 0
            ? "Pattern saved — all slots already exist"
            : `Pattern saved — ${created} slot${created === 1 ? "" : "s"} created`;
        },
        errorFallback: "Could not save",
      },
    );
  }

  return (
    <div className="card">
      <CollapsibleSection
        title={`Set up the schedule (${pluralLabel(adminLabel)} only)`}
        defaultOpen={false}
      >
        <div className="stack" style={{ gap: 12 }}>
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>When can sessions happen?</strong>
            <div className="row wrap" style={{ gap: 6 }}>
              {cells.map((cell) => (
                <button
                  key={patternCellKey(cell)}
                  type="button"
                  className="pill"
                  title="Remove"
                  onClick={() => setCells(cells.filter((c) => c !== cell))}
                >
                  {cellLabel(cell)} <X size={12} aria-hidden />
                </button>
              ))}
            </div>
            <AddCellForm
              onAdd={(added) => {
                const known = new Set(cells.map(patternCellKey));
                setCells([
                  ...cells,
                  ...added.filter((c) => !known.has(patternCellKey(c))),
                ]);
              }}
            />
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>During which dates?</strong>
            <div className="row wrap" style={{ gap: 6 }}>
              {terms.map((term, i) => (
                <button
                  key={`${term.name}-${i}`}
                  type="button"
                  className="pill"
                  title="Remove"
                  onClick={() => setTerms(terms.filter((t) => t !== term))}
                >
                  {term.name} · {term.start} – {term.end}{" "}
                  <X size={12} aria-hidden />
                </button>
              ))}
            </div>
            <AddTermForm onAdd={(term) => setTerms([...terms, term])} />
          </div>

          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            {slots.length > 0 ? (
              <>
                ➜ This creates <strong>{slots.length} slots</strong>. Electors
                will be asked about: {cellSummary}. Slots that already exist are
                left alone.
              </>
            ) : (
              <>Add at least one time and one date range to generate slots.</>
            )}
          </p>

          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={save}
            >
              {slots.length > 0 ? "Save & generate slots" : "Save pattern"}
            </button>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
