"use client";

import { useState } from "react";

import { isDigestEnabled } from "@timetable/shared";

import type { DigestSettings } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($e: Boolean, $f: String, $w: Int) {
  updateMyNotificationSettings(
    digestEnabled: $e, digestFrequency: $f, digestWeekday: $w
  ) { id }
}`;

export type { DigestSettings };

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Cadence = "never" | "daily" | "weekly";

export function DigestSettingsForm({ current }: { current: DigestSettings }) {
  const { run, busy } = useGqlAction();
  // "Never" folds the enabled flag into the same dropdown as the cadence
  // (2026-07-30) — one control instead of a checkbox + frequency select.
  const [cadence, setCadence] = useState<Cadence>(
    isDigestEnabled(current) ? (current.digestFrequency ?? "daily") : "never",
  );
  const [weekday, setWeekday] = useState(current.digestWeekday ?? 1);
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const enabled = cadence !== "never";
    void run(
      MUTATION,
      // Leave the stored frequency untouched when Never is picked (the
      // mutation ignores an absent frequency) so re-enabling remembers it.
      { e: enabled, f: enabled ? cadence : undefined, w: weekday },
      {
        success: "Digest settings saved",
        errorFallback: "Could not save settings",
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 className="section-title" style={{ marginBottom: 10 }}>
        Email digests
      </h2>
      <p className="faint" style={{ marginTop: 0, fontSize: "var(--text-xs)" }}>
        One email per forum with what you haven&rsquo;t seen — comments on your
        topics, replies, and new topics.
      </p>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="digest-frequency">How often</label>
          <select
            id="digest-frequency"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            style={{ width: "auto" }}
          >
            <option value="never">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        {cadence === "weekly" ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="digest-weekday">On</label>
            <select
              id="digest-weekday"
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              style={{ width: "auto" }}
            >
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>
    </form>
  );
}
