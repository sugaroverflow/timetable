"use client";

import { useState } from "react";
import { Plus, Settings, X } from "lucide-react";

import {
  patternCellKey,
  type CalendarPatternCell,
  type CalendarSettings,
  type CalendarTerm,
} from "@timetable/shared";

import { pluralLabel } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const SAVE_AND_NOOP = `mutation($s: String!, $cal: String!) {
  updateForumSettings(idOrSlug: $s, calendarJson: $cal) { id }
}`;
const SAVE_AND_GENERATE = `mutation($s: String!, $cal: String!, $slots: String!) {
  updateForumSettings(idOrSlug: $s, calendarJson: $cal) { id }
  createTimeslots(idOrSlug: $s, slotsJson: $slots) { created augmented }
}`;
const CREATE_SLOTS = `mutation($s: String!, $slots: String!) {
  createTimeslots(idOrSlug: $s, slotsJson: $slots) { created augmented }
}`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Mon-first ordering for the weekday picker.
const PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0];

function cellLabel(cell: CalendarPatternCell): string {
  const where = cell.locations?.length ? ` · ${cell.locations.join(", ")}` : "";
  return `${WEEKDAYS[cell.weekday]} ${cell.start}–${cell.end}${where}`;
}

/** Local YYYY-MM-DD for a Date (generation runs on the admin's clock). */
function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type SlotJson = {
  startsAt: string;
  endsAt: string;
  cellKey?: string;
  locations: string[];
};

/** Pattern × terms → concrete slots, computed in the ADMIN'S browser
 * timezone (slots are stored UTC; there is no forum-timezone setting yet).
 * Each generated slot carries its cellKey so elector patterns can infer,
 * and its cell's locations (slot locations, 2026-08-11). */
function computeSlots(
  cells: CalendarPatternCell[],
  terms: CalendarTerm[],
): SlotJson[] {
  const slots: SlotJson[] = [];
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
          locations: cell.locations ?? [],
        });
      }
    }
  }
  return slots;
}

/** "N slots created, M gained locations" (aggregation) — shared by the
 * generate and one-off toasts. */
function createdMessage(
  data: unknown,
  prefix: string,
  nothing: string,
): string {
  const result = (
    data as { createTimeslots?: { created: number; augmented: number } }
  ).createTimeslots;
  const created = result?.created ?? 0;
  const augmented = result?.augmented ?? 0;
  const parts = [
    created > 0 ? `${created} slot${created === 1 ? "" : "s"} created` : null,
    augmented > 0
      ? `${augmented} slot${augmented === 1 ? "" : "s"} gained locations`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${prefix} — ${parts.join(", ")}` : nothing;
}

/** Location checkboxes (slot locations, 2026-08-11): every slot needs at
 * least one when the forum has locations configured. */
function LocationPicker({
  locations,
  selected,
  onChange,
}: {
  locations: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (locations.length === 0) return null;
  return (
    <>
      {locations.map((loc) => (
        <label
          key={loc}
          className="row"
          style={{ gap: 3, fontSize: 12, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={selected.has(loc)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(loc);
              else next.delete(loc);
              onChange(next);
            }}
          />
          {loc}
        </label>
      ))}
    </>
  );
}

/** Selected locations in the forum's configured order. */
function pickedLocations(all: string[], selected: Set<string>): string[] {
  return all.filter((l) => selected.has(l));
}

function AddCellForm({
  locations,
  onAdd,
}: {
  /** The forum's configured locations; adding a cell requires ≥1 picked. */
  locations: string[];
  onAdd: (cells: CalendarPatternCell[]) => void;
}) {
  const [days, setDays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("21:00");
  const [where, setWhere] = useState<Set<string>>(new Set());
  const needsLocation = locations.length > 0 && where.size === 0;

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
      <LocationPicker
        locations={locations}
        selected={where}
        onChange={setWhere}
      />
      <button
        type="button"
        className="btn"
        disabled={
          days.size === 0 || !start || !end || end <= start || needsLocation
        }
        onClick={() => {
          onAdd(
            PICKER_ORDER.filter((wd) => days.has(wd)).map((weekday) => ({
              weekday,
              start,
              end,
              ...(locations.length > 0
                ? { locations: pickedLocations(locations, where) }
                : {}),
            })),
          );
          setDays(new Set());
          setWhere(new Set());
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

/** Release one-off dates outside the weekly pattern — e.g. the hall's rare
 * openings. Aggregation makes this safe: a date that already has a slot
 * gains the location instead of duplicating the slot. */
function AddOneOffForm({
  slug,
  locations,
}: {
  slug: string;
  locations: string[];
}) {
  const { run, busy } = useGqlAction();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("21:00");
  const [where, setWhere] = useState<Set<string>>(new Set());
  const needsLocation = locations.length > 0 && where.size === 0;

  return (
    <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
      <input
        type="date"
        aria-label="Date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        style={{ width: "auto" }}
      />
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
      <LocationPicker
        locations={locations}
        selected={where}
        onChange={setWhere}
      />
      <button
        type="button"
        className="btn"
        disabled={
          busy || !date || !start || !end || end <= start || needsLocation
        }
        onClick={() => {
          const slot: SlotJson = {
            startsAt: new Date(`${date}T${start}:00`).toISOString(),
            endsAt: new Date(`${date}T${end}:00`).toISOString(),
            locations: pickedLocations(locations, where),
          };
          void run(
            CREATE_SLOTS,
            { s: slug, slots: JSON.stringify([slot]) },
            {
              success: (data) =>
                createdMessage(data, "Saved", "That slot already exists"),
              errorFallback: "Could not add the slot",
              onSuccess: () => {
                setDate("");
                setWhere(new Set());
              },
            },
          );
        }}
      >
        <Plus size={16} aria-hidden /> Add slot
      </button>
    </div>
  );
}

/** Merge freshly added cells into the pattern: a cell whose weekday+time
 * already exists unions its locations into that cell (aggregation, matching
 * slot behaviour) instead of duplicating it. */
function mergeCells(
  cells: CalendarPatternCell[],
  added: CalendarPatternCell[],
): CalendarPatternCell[] {
  const merged = [...cells];
  for (const cell of added) {
    const key = patternCellKey(cell);
    const i = merged.findIndex((c) => patternCellKey(c) === key);
    if (i === -1) {
      merged.push(cell);
      continue;
    }
    const known = merged[i]!;
    const locations = [
      ...(known.locations ?? []),
      ...(cell.locations ?? []).filter(
        (l) => !(known.locations ?? []).includes(l),
      ),
    ];
    merged[i] = { ...known, ...(locations.length > 0 ? { locations } : {}) };
  }
  return merged;
}

/**
 * Admin setup card (calendar v2): the schedule as pattern × terms, with a
 * consequence-preview sentence before anything is saved. Generation is
 * idempotent — existing slots are skipped or gain locations server-side —
 * so re-generating after adding a term, cell, or location is safe.
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
  const [open, setOpen] = useState(false);
  const [cells, setCells] = useState<CalendarPatternCell[]>(
    current.patternCells ?? [],
  );
  const [terms, setTerms] = useState<CalendarTerm[]>(current.terms ?? []);
  const locations = current.locations ?? [];

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
        success: (data) =>
          createdMessage(
            data,
            "Pattern saved",
            "Pattern saved — all slots already exist",
          ),
        errorFallback: "Could not save",
      },
    );
  }

  // Same reveal-in-place rule as "Propose a different time" (QA
  // 2026-08-05, replacing the folded card): a plain button until pressed.
  if (!open) {
    return (
      <button
        type="button"
        className="btn"
        style={{ alignSelf: "flex-start" }}
        onClick={() => setOpen(true)}
      >
        <Settings size={16} aria-hidden /> Set up the schedule (
        {pluralLabel(adminLabel)} only)
      </button>
    );
  }

  return (
    <div className="card">
      <div className="stack" style={{ gap: 12 }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          Set up the schedule
        </h3>
        <div className="stack" style={{ gap: 6 }}>
          <strong className="field-heading">
            When{locations.length > 0 ? " and where" : ""} can sessions happen?
          </strong>
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
            locations={locations}
            onAdd={(added) => setCells(mergeCells(cells, added))}
          />
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <strong className="field-heading">During which dates?</strong>
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
              left alone
              {locations.length > 0 ? " (new locations are added to them)" : ""}
              .
            </>
          ) : (
            <>Add at least one time and one date range to generate slots.</>
          )}
        </p>

        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={save}
          >
            {slots.length > 0 ? "Save & generate slots" : "Save pattern"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <strong className="field-heading">One-off dates</strong>
          <p className="hint" style={{ margin: 0 }}>
            Release extra dates outside the weekly pattern — e.g. when a rarer
            location becomes available. A date the calendar already has simply
            gains the location.
          </p>
          <AddOneOffForm slug={slug} locations={locations} />
        </div>
      </div>
    </div>
  );
}
