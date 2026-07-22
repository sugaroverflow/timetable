/* eslint-disable complexity, max-lines-per-function -- audit debt (2026-07-22): decomposition queued — remove this disable when refactoring */
"use client";

import { useState } from "react";

import { clientGql } from "@/lib/clientGraphql";
import type { DigestSettings, RoleLabels } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($s: String!, $name: String, $desc: String, $privacy: String, $cd: String) {
  updateTimetableProfile(idOrSlug: $s, name: $name, description: $desc, privacy: $privacy, customDomain: $cd) { id }
}`;

const SETTINGS_MUTATION = `mutation Labels(
  $s: String!, $ra: String, $rh: String, $re: String,
  $dnt: Boolean, $dr: Boolean, $da: Boolean
) {
  updateTimetableSettings(
    idOrSlug: $s
    roleLabelAdmin: $ra
    roleLabelHost: $rh
    roleLabelElector: $re
    digestNewTopics: $dnt
    digestReplies: $dr
    digestActivity: $da
  ) { id }
}`;

/** Timetable profile section (QA #59 reorg): identity, visibility, role
 * labels with a live preview sentence, and digest defaults at the bottom.
 * Colours/cover/icon live in the Theme section. */
export function TimetableProfileForm({
  slug,
  name: initialName,
  description: initialDescription,
  privacy: initialPrivacy,
  customDomain: initialCustomDomain,
  roleLabels,
  digestDefaults,
}: {
  slug: string;
  name: string;
  description: string | null;
  privacy: string;
  customDomain: string | null;
  roleLabels?: RoleLabels;
  digestDefaults?: DigestSettings;
}) {
  const { run, busy } = useGqlAction();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [privacy, setPrivacy] = useState(initialPrivacy);
  const [customDomain, setCustomDomain] = useState(initialCustomDomain ?? "");
  const [admin, setAdmin] = useState(roleLabels?.admin ?? "Admin");
  const [host, setHost] = useState(roleLabels?.host ?? "Host");
  const [elector, setElector] = useState(roleLabels?.elector ?? "Elector");
  const [digestTopics, setDigestTopics] = useState(
    digestDefaults?.digestNewTopics ?? false,
  );
  const [digestReplies, setDigestReplies] = useState(
    digestDefaults?.digestReplies ?? false,
  );
  const [digestActivity, setDigestActivity] = useState(
    digestDefaults?.digestActivity ?? false,
  );
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { s: slug, name, desc: description, privacy, cd: customDomain },
      {
        success: "Forum profile saved",
        errorFallback: "Could not save",
        // Second write rides inside onSuccess so a failure in either
        // mutation lands in the same error toast, and the success toast
        // only fires once both have landed.
        onSuccess: async () => {
          await clientGql(SETTINGS_MUTATION, {
            s: slug,
            ra: admin,
            rh: host,
            re: elector,
            dnt: digestTopics,
            dr: digestReplies,
            da: digestActivity,
          });
          setSaved(true);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Forum profile</h2>
      <div className="field">
        <label htmlFor="tt-name">Name</label>
        <input
          id="tt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <p className="faint" style={{ margin: "0 0 12px", fontSize: 12 }}>
        URL: /t/{slug} (set at creation)
      </p>
      <div className="field">
        <label htmlFor="tt-desc">Description</label>
        <textarea
          id="tt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tt-privacy">Visibility</label>
        <select
          id="tt-privacy"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value)}
        >
          <option value="private">Private — members only</option>
          <option value="public">
            Public — all topics, comments, and bios
          </option>
          <option value="hosts_only">
            Hosts only — topics and host bios public, no comments
          </option>
          <option value="no_comments">
            No comments — topics and all bios public, no comments
          </option>
          <option value="deactivated">Deactivated — admins only</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="tt-domain">Custom domain (coming soon)</label>
        <input
          id="tt-domain"
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
          placeholder="forum.2026.newspeak.house"
        />
        <p className="faint" style={{ margin: "4px 0 0", fontSize: 12 }}>
          Saved for later — custom-domain routing isn&rsquo;t wired up yet.
        </p>
      </div>

      <h3 style={{ fontSize: 15, margin: "18px 0 2px" }}>Role labels</h3>
      <div className="field">
        <label htmlFor="ra">Admin label</label>
        <input
          id="ra"
          value={admin}
          onChange={(e) => setAdmin(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="rh">Host label</label>
        <input id="rh" value={host} onChange={(e) => setHost(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="re">Elector label</label>
        <input
          id="re"
          value={elector}
          onChange={(e) => setElector(e.target.value)}
        />
      </div>
      <p className="preview-roles">
        A <b>{host || "Host"}</b> proposes topics; an{" "}
        <b>{elector || "Elector"}</b> hearts and comments; an{" "}
        <b>{admin || "Admin"}</b> moderates and runs settings.
      </p>

      <h3 style={{ fontSize: 15, margin: "18px 0 2px" }}>Default digest</h3>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        New members start with these. Each person can change their own from
        their profile.
      </p>
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={digestTopics}
          onChange={(e) => setDigestTopics(e.target.checked)}
          style={{ width: "auto" }}
        />
        New topics
      </label>
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={digestReplies}
          onChange={(e) => setDigestReplies(e.target.checked)}
          style={{ width: "auto" }}
        />
        Replies to their comments
      </label>
      <label className="row" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={digestActivity}
          onChange={(e) => setDigestActivity(e.target.checked)}
          style={{ width: "auto" }}
        />
        Activity on their topics (hosts)
      </label>

      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
