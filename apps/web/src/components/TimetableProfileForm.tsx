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

type IdentityState = {
  name: string;
  description: string;
  privacy: string;
  customDomain: string;
};

type LabelsState = { admin: string; host: string; elector: string };

type DigestState = { topics: boolean; replies: boolean; activity: boolean };

function initialLabels(roleLabels: RoleLabels = {}): LabelsState {
  return {
    admin: roleLabels.admin ?? "Admin",
    host: roleLabels.host ?? "Host",
    elector: roleLabels.elector ?? "Elector",
  };
}

function initialDigests(digestDefaults: DigestSettings = {}): DigestState {
  return {
    topics: digestDefaults.digestNewTopics ?? false,
    replies: digestDefaults.digestReplies ?? false,
    activity: digestDefaults.digestActivity ?? false,
  };
}

function IdentityFields({
  slug,
  value,
  onChange,
}: {
  slug: string;
  value: IdentityState;
  onChange: (patch: Partial<IdentityState>) => void;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="tt-name">Name</label>
        <input
          id="tt-name"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>
      <p className="faint" style={{ margin: "0 0 12px", fontSize: 12 }}>
        URL: /t/{slug} (set at creation)
      </p>
      <div className="field">
        <label htmlFor="tt-desc">Description</label>
        <textarea
          id="tt-desc"
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="tt-privacy">Visibility</label>
        <select
          id="tt-privacy"
          value={value.privacy}
          onChange={(e) => onChange({ privacy: e.target.value })}
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
          value={value.customDomain}
          onChange={(e) => onChange({ customDomain: e.target.value })}
          placeholder="forum.2026.newspeak.house"
        />
        <p className="faint" style={{ margin: "4px 0 0", fontSize: 12 }}>
          Saved for later — custom-domain routing isn&rsquo;t wired up yet.
        </p>
      </div>
    </>
  );
}

function RoleLabelFields({
  value,
  onChange,
}: {
  value: LabelsState;
  onChange: (patch: Partial<LabelsState>) => void;
}) {
  return (
    <>
      <h3 style={{ fontSize: 15, margin: "18px 0 2px" }}>Role labels</h3>
      <div className="field">
        <label htmlFor="ra">Admin label</label>
        <input
          id="ra"
          value={value.admin}
          onChange={(e) => onChange({ admin: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="rh">Host label</label>
        <input
          id="rh"
          value={value.host}
          onChange={(e) => onChange({ host: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="re">Elector label</label>
        <input
          id="re"
          value={value.elector}
          onChange={(e) => onChange({ elector: e.target.value })}
        />
      </div>
      <p className="preview-roles">
        A <b>{value.host || "Host"}</b> proposes topics; an{" "}
        <b>{value.elector || "Elector"}</b> hearts and comments; an{" "}
        <b>{value.admin || "Admin"}</b> moderates and runs settings.
      </p>
    </>
  );
}

function DigestFields({
  value,
  onChange,
}: {
  value: DigestState;
  onChange: (patch: Partial<DigestState>) => void;
}) {
  return (
    <>
      <h3 style={{ fontSize: 15, margin: "18px 0 2px" }}>Default digest</h3>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        New members start with these. Each person can change their own from
        their profile.
      </p>
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={value.topics}
          onChange={(e) => onChange({ topics: e.target.checked })}
          style={{ width: "auto" }}
        />
        New topics
      </label>
      <label className="row" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={value.replies}
          onChange={(e) => onChange({ replies: e.target.checked })}
          style={{ width: "auto" }}
        />
        Replies to their comments
      </label>
      <label className="row" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={value.activity}
          onChange={(e) => onChange({ activity: e.target.checked })}
          style={{ width: "auto" }}
        />
        Activity on their topics (hosts)
      </label>
    </>
  );
}

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
  const [identity, setIdentity] = useState<IdentityState>({
    name: initialName,
    description: initialDescription ?? "",
    privacy: initialPrivacy,
    customDomain: initialCustomDomain ?? "",
  });
  const [labels, setLabels] = useState<LabelsState>(() =>
    initialLabels(roleLabels),
  );
  const [digests, setDigests] = useState<DigestState>(() =>
    initialDigests(digestDefaults),
  );
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      {
        s: slug,
        name: identity.name,
        desc: identity.description,
        privacy: identity.privacy,
        cd: identity.customDomain,
      },
      {
        success: "Forum profile saved",
        errorFallback: "Could not save",
        // Second write rides inside onSuccess so a failure in either
        // mutation lands in the same error toast, and the success toast
        // only fires once both have landed.
        onSuccess: async () => {
          await clientGql(SETTINGS_MUTATION, {
            s: slug,
            ra: labels.admin,
            rh: labels.host,
            re: labels.elector,
            dnt: digests.topics,
            dr: digests.replies,
            da: digests.activity,
          });
          setSaved(true);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Forum profile</h2>
      <IdentityFields
        slug={slug}
        value={identity}
        onChange={(patch) => setIdentity((s) => ({ ...s, ...patch }))}
      />
      <RoleLabelFields
        value={labels}
        onChange={(patch) => setLabels((s) => ({ ...s, ...patch }))}
      />
      <DigestFields
        value={digests}
        onChange={(patch) => setDigests((s) => ({ ...s, ...patch }))}
      />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
