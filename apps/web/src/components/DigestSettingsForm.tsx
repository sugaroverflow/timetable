"use client";

import { useState } from "react";

import type { DigestSettings } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($t: Boolean, $r: Boolean, $a: Boolean, $f: String, $w: Int) {
  updateMyNotificationSettings(
    digestNewTopics: $t, digestReplies: $r, digestActivity: $a
    digestFrequency: $f, digestWeekday: $w
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

export function DigestSettingsForm({ current }: { current: DigestSettings }) {
  const { run, busy } = useGqlAction();
  const [topics, setTopics] = useState(current.digestNewTopics ?? false);
  const [replies, setReplies] = useState(current.digestReplies ?? false);
  const [activity, setActivity] = useState(current.digestActivity ?? false);
  const [frequency, setFrequency] = useState(
    current.digestFrequency ?? "daily",
  );
  const [weekday, setWeekday] = useState(current.digestWeekday ?? 1);
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { t: topics, r: replies, a: activity, f: frequency, w: weekday },
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
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={topics}
          onChange={(e) => setTopics(e.target.checked)}
          style={{ width: "auto" }}
        />
        New topics
      </label>
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={replies}
          onChange={(e) => setReplies(e.target.checked)}
          style={{ width: "auto" }}
        />
        Replies to my comments
      </label>
      <label className="row" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={activity}
          onChange={(e) => setActivity(e.target.checked)}
          style={{ width: "auto" }}
        />
        Activity on my topics (hosts)
      </label>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="digest-frequency">How often</label>
          <select
            id="digest-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
            style={{ width: "auto" }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        {frequency === "weekly" ? (
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
