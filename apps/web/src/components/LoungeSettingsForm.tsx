"use client";

import { useState } from "react";

import { Switch } from "@/components/Switch";
import { pluralLabel } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";
import { useSavedSnapshot } from "@/lib/useSavedSnapshot";

const MUTATION = `mutation Lounge($s: String!, $e: Boolean!) {
  updateTimetableSettings: updateForumSettings(
    idOrSlug: $s
    loungeEnabled: $e
  ) { id }
}`;

/** Forum Settings "{Host} Lounge" subsection (2026-09-30): the hosts-only
 * room is OFF until an admin switches it on here, so no forum sprouts a
 * Lounge unannounced. Switching it off hides the room, its nav link and
 * its digest card; nothing is deleted. */
export function LoungeSettingsForm({
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
  const { saved, markSaved } = useSavedSnapshot([enabled]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void run(
      MUTATION,
      { s: slug, e: enabled },
      {
        success: "Settings saved",
        errorFallback: "Could not save settings",
        onSuccess: markSaved,
      },
    );
  }

  const hosts = pluralLabel(hostLabel.toLowerCase());
  const admins = pluralLabel(adminLabel.toLowerCase());

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
      <div>
        <h3 className="settings-subtitle">{hostLabel} Lounge</h3>
        <p className="hint" style={{ margin: "2px 0 0" }}>
          A room where {hosts} and {admins} talk among themselves, away from any
          one topic. {pluralLabel(electorLabel)} never see it. New conversations
          reach {hosts} in their email digest, after everything else. Switching
          it off hides the room; nothing is deleted.
        </p>
      </div>
      <Switch
        checked={enabled}
        onChange={setEnabled}
        label={`Open the ${hostLabel} Lounge`}
      />
      <div className="row wrap">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </form>
  );
}
