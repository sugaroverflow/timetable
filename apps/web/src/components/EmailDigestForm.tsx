"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { isDigestEnabled } from "@timetable/shared";

import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";
import type { DigestSettings } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation DigestDefaults($s: String!, $e: Boolean) {
  updateTimetableSettings: updateForumSettings(
    idOrSlug: $s
    digestEnabled: $e
  ) { id }
}`;

/** Forum Settings "Email Digest" card (2026-07-29): the per-forum digest
 * default (on/off — digests always include everything) plus a send-test
 * button that emails the admin the real template filled with example
 * notifications. */
export function EmailDigestForm({
  slug,
  digestDefaults,
}: {
  slug: string;
  digestDefaults?: DigestSettings;
}) {
  const { run, busy } = useGqlAction();
  const { toast, toastError } = useToast();
  const [enabled, setEnabled] = useState(
    digestDefaults ? isDigestEnabled(digestDefaults) : false,
  );
  const [saved, setSaved] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { s: slug, e: enabled },
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
        A regular email summary of forum activity — comments on their topics,
        replies, and new topics. New members start with this default; each
        person can switch it on or off on their Notifications page.
      </p>
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ width: "auto" }}
        />
        Send digests to new members
      </label>
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
