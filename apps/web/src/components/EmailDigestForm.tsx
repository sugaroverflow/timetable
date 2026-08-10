"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { isDigestEnabled } from "@timetable/shared";

import { Switch } from "@/components/Switch";
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
  // Default ON (QA 2026-08-10): an untouched card means new members get
  // digests — mirrors getDigestDefaults in core/invites.ts.
  const [enabled, setEnabled] = useState(
    digestDefaults && Object.keys(digestDefaults).length > 0
      ? isDigestEnabled(digestDefaults)
      : true,
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
    <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
      <div>
        <h3 className="settings-subtitle">Email digest</h3>
        <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
          A regular email summary of forum activity — comments on their topics,
          replies, and new topics. New members start with this default; each
          person can switch it on or off on their Notifications page.
        </p>
      </div>
      <Switch
        checked={enabled}
        onChange={setEnabled}
        label="Send digests to new members"
      />
      <div className="row wrap">
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
