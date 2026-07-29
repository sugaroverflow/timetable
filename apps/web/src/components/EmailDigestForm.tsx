"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";
import type { DigestSettings } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation DigestDefaults($s: String!, $dnt: Boolean, $dr: Boolean, $da: Boolean) {
  updateTimetableSettings: updateForumSettings(
    idOrSlug: $s
    digestNewTopics: $dnt
    digestReplies: $dr
    digestActivity: $da
  ) { id }
}`;

type DigestState = { topics: boolean; replies: boolean; activity: boolean };

function DigestToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="row" style={{ marginBottom: 8 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: "auto" }}
      />
      {label}
    </label>
  );
}

/** Forum Settings "Email Digest" card (2026-07-29): the per-forum digest
 * defaults (moved out of the profile form) plus a send-test button that
 * emails the admin the real template filled with example notifications. */
export function EmailDigestForm({
  slug,
  digestDefaults,
}: {
  slug: string;
  digestDefaults?: DigestSettings;
}) {
  const { run, busy } = useGqlAction();
  const { toast, toastError } = useToast();
  const [state, setState] = useState<DigestState>({
    topics: digestDefaults?.digestNewTopics ?? false,
    replies: digestDefaults?.digestReplies ?? false,
    activity: digestDefaults?.digestActivity ?? false,
  });
  const [saved, setSaved] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { s: slug, dnt: state.topics, dr: state.replies, da: state.activity },
      {
        success: "Digest defaults saved",
        errorFallback: "Could not save digest defaults",
        onSuccess: () => setSaved(true),
      },
    );
  }

  async function sendTest() {
    setSendingTest(true);
    try {
      const res = await clientApi(`/api/forums/${slug}/digest-test`, {
        method: "POST",
      });
      const body = (await res.json()) as { sentTo?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not send");
      toast(`Test digest sent to ${body.sentTo}`);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Could not send the test digest",
      );
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 className="section-title" style={{ marginBottom: 10 }}>
        Email digest
      </h2>
      <p className="faint" style={{ marginTop: 0, fontSize: "var(--text-xs)" }}>
        A daily email summary of forum activity. New members start with these
        defaults; each person can change their own on their Notifications page.
      </p>
      <DigestToggle
        label="New topics"
        checked={state.topics}
        onChange={(v) => setState((s) => ({ ...s, topics: v }))}
      />
      <DigestToggle
        label="Replies to their comments"
        checked={state.replies}
        onChange={(v) => setState((s) => ({ ...s, replies: v }))}
      />
      <DigestToggle
        label="Activity on their topics (hosts)"
        checked={state.activity}
        onChange={(v) => setState((s) => ({ ...s, activity: v }))}
      />
      <div className="row wrap" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        <button
          className="btn"
          type="button"
          disabled={sendingTest}
          onClick={sendTest}
          title="Emails YOU the digest template filled with example items"
        >
          <Send size={15} aria-hidden />{" "}
          {sendingTest ? "Sending…" : "Send test digest"}
        </button>
      </div>
    </form>
  );
}
