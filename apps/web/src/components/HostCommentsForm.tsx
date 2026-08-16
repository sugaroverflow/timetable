"use client";

import { useState } from "react";

import { Switch } from "@/components/Switch";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation HostComments($s: String!, $e: Boolean!) {
  updateTimetableSettings: updateForumSettings(
    idOrSlug: $s
    hostCommentsEnabled: $e
  ) { id }
}`;

/** Forum Settings "{Host}-only comments" subsection (host hearts,
 * 2026-08-04): the host-only thread as a forum option — for forums where
 * every host is also an elector the faculty backchannel is meaningless.
 * Switching it off hides the thread and the attributed 💙 row (nothing is
 * deleted); host 💙s keep working as bookmarks only admins can see in
 * Analysis. */
export function HostCommentsForm({
  slug,
  enabled: initialEnabled,
  hostLabel,
  electorLabel,
  adminLabel,
}: {
  slug: string;
  enabled: boolean;
  hostLabel: string;
  electorLabel: string;
  adminLabel: string;
}) {
  const { run, busy } = useGqlAction();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { s: slug, e: enabled },
      {
        success: "Settings saved",
        errorFallback: "Could not save settings",
        onSuccess: () => setSaved(true),
      },
    );
  }

  const hosts = hostLabel.toLowerCase();
  const electors = electorLabel.toLowerCase();
  const admins = adminLabel.toLowerCase();

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
      <div>
        <h3 className="settings-subtitle">{hostLabel}-only comments</h3>
        <p className="hint" style={{ margin: "2px 0 0" }}>
          A comment thread on each topic that only {hosts}s and {admins}s see,
          with a 💙 row where {hosts}s show interest in each other&rsquo;s
          topics. 💙s never affect the {electors}s&rsquo; vote. In a forum where
          every {hosts} is also an {electors} this backchannel adds little —
          switch it off and 💙s become private bookmarks only {admins}s see in
          Analysis. Nothing is deleted either way.
        </p>
      </div>
      <Switch
        checked={enabled}
        onChange={setEnabled}
        label={`Show the ${hosts}-only thread and 💙 row`}
      />
      <div className="row wrap">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </form>
  );
}
