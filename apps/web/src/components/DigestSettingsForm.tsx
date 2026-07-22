"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import type { DigestSettings } from "@/lib/timetableSettings";

const MUTATION = `mutation($t: Boolean, $r: Boolean, $a: Boolean) {
  updateMyNotificationSettings(
    digestNewTopics: $t, digestReplies: $r, digestActivity: $a
  ) { id }
}`;

export type { DigestSettings };

export function DigestSettingsForm({ current }: { current: DigestSettings }) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [topics, setTopics] = useState(current.digestNewTopics ?? false);
  const [replies, setReplies] = useState(current.digestReplies ?? false);
  const [activity, setActivity] = useState(current.digestActivity ?? false);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await clientGql(MUTATION, { t: topics, r: replies, a: activity });
      setSaved(true);
      toast("Digest settings saved");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Could not save settings",
      );
    }
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
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved" : "Save preferences"}
      </button>
    </form>
  );
}
