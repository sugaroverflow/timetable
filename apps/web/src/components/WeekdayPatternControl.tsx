"use client";

import { useState } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($s: String!, $wd: Int!, $state: String!) {
  setWeekdayAvailability(idOrSlug: $s, weekday: $wd, state: $state)
}`;

// Label -> UTC weekday index (Date.getUTCDay: 0=Sun).
const DAYS: { label: string; wd: number }[] = [
  { label: "Mon", wd: 1 },
  { label: "Tue", wd: 2 },
  { label: "Wed", wd: 3 },
  { label: "Thu", wd: 4 },
  { label: "Fri", wd: 5 },
  { label: "Sat", wd: 6 },
  { label: "Sun", wd: 0 },
];

const CYCLE = ["", "green", "yellow", "red"] as const;
const ICON: Record<string, string> = {
  green: "\uD83D\uDFE2",
  yellow: "\uD83D\uDFE1",
  red: "\uD83D\uDD34",
};

export function WeekdayPatternControl({ slug }: { slug: string }) {
  const { run, busy } = useGqlAction();
  const [states, setStates] = useState<Record<number, string>>({});

  function cycle(wd: number) {
    const current = states[wd] ?? "";
    const idx = CYCLE.indexOf(current as (typeof CYCLE)[number]);
    const next = CYCLE[(idx + 1) % CYCLE.length] ?? "";
    setStates((prev) => ({ ...prev, [wd]: next }));
    if (!next) return;
    const day = DAYS.find((d) => d.wd === wd)?.label ?? "day";
    const word =
      next === "green" ? "available" : next === "yellow" ? "maybe" : "can't";
    void run(
      MUTATION,
      { s: slug, wd, state: next },
      {
        success: `Every ${day} set to “${word}”`,
        errorFallback: "Could not apply pattern",
      },
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Weekly pattern</h3>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Click a day to cycle availability and apply it to every slot on that
        weekday.
      </p>
      <div className="weekday-grid">
        {DAYS.map((d) => {
          const s = states[d.wd] ?? "";
          return (
            <button
              key={d.wd}
              type="button"
              className={`avail-btn ${s} ${s ? "on" : ""}`}
              style={{ width: "auto", padding: "0 10px" }}
              disabled={busy}
              onClick={() => cycle(d.wd)}
            >
              {d.label} {s ? ICON[s] : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
