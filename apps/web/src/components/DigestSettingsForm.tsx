"use client";

import { useState } from "react";

import type { DigestSettings } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($t: Boolean, $r: Boolean, $a: Boolean) {
  updateMyNotificationSettings(
    digestNewTopics: $t, digestReplies: $r, digestActivity: $a
  ) { id }
}`;

export type { DigestSettings };

export function DigestSettingsForm({ current }: { current: DigestSettings }) {
  const { run, busy } = useGqlAction();
  const [topics, setTopics] = useState(current.digestNewTopics ?? false);
  const [replies, setReplies] = useState(current.digestReplies ?? false);
  const [activity, setActivity] = useState(current.digestActivity ?? false);
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { t: topics, r: replies, a: activity },
      {
        success: "Digest settings saved",
        errorFallback: "Could not save settings",
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Email digests</h2>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Preferences are saved here. Delivery runs when cron and email are
        configured.
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
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>
    </form>
  );
}
