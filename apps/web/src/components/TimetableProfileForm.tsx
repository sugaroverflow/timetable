"use client";

import { useState } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { clientGql } from "@/lib/clientGraphql";
import type { RoleLabels } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($s: String!, $name: String, $privacy: String, $cd: String, $slug: String) {
  updateTimetableProfile: updateForumProfile(idOrSlug: $s, name: $name, privacy: $privacy, customDomain: $cd, slug: $slug) { id slug }
}`;

const SETTINGS_MUTATION = `mutation Labels(
  $s: String!, $ra: String, $rh: String, $re: String
) {
  updateTimetableSettings: updateForumSettings(
    idOrSlug: $s
    roleLabelAdmin: $ra
    roleLabelHost: $rh
    roleLabelElector: $re
  ) { id }
}`;

type IdentityState = {
  name: string;
  privacy: string;
  customDomain: string;
  slug: string;
};

type LabelsState = { admin: string; host: string; elector: string };

function initialLabels(roleLabels: RoleLabels = {}): LabelsState {
  return {
    admin: roleLabels.admin ?? "Admin",
    host: roleLabels.host ?? "Host",
    elector: roleLabels.elector ?? "Elector",
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
      <div className="field">
        <label htmlFor="tt-slug">URL</label>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <span className="faint">/f/</span>
          <input
            id="tt-slug"
            value={value.slug}
            onChange={(e) =>
              onChange({
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
              })
            }
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={60}
          />
        </div>
        {value.slug !== slug ? (
          <p className="hint" style={{ margin: "4px 0 0" }}>
            Changing the URL is safe — /f/{slug} will permanently redirect here,
            so old links and bookmarks keep working.
          </p>
        ) : null}
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
        <p className="hint" style={{ margin: "4px 0 0" }}>
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
        <b>{value.admin || "Admin"}</b> reviews topics and runs settings.
      </p>
    </>
  );
}

/** Timetable profile section (QA #59 reorg): identity, visibility, role
 * labels with a live preview sentence. Digest defaults moved to the Email
 * digest card (2026-07-29).
 * Colours/cover/icon live in the Theme section. */
export function TimetableProfileForm({
  slug,
  name: initialName,
  privacy: initialPrivacy,
  customDomain: initialCustomDomain,
  roleLabels,
}: {
  slug: string;
  name: string;
  privacy: string;
  customDomain: string | null;
  roleLabels?: RoleLabels;
}) {
  const { run, busy } = useGqlAction();
  const [identity, setIdentity] = useState<IdentityState>({
    name: initialName,
    privacy: initialPrivacy,
    customDomain: initialCustomDomain ?? "",
    slug: slug,
  });
  const [labels, setLabels] = useState<LabelsState>(() =>
    initialLabels(roleLabels),
  );
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const newSlug = identity.slug.trim();
    void run(
      MUTATION,
      {
        s: slug,
        name: identity.name,
        privacy: identity.privacy,
        cd: identity.customDomain,
        slug: newSlug || null,
      },
      {
        success: "Forum profile saved",
        errorFallback: "Could not save",
        // Second write rides inside onSuccess so a failure in either
        // mutation lands in the same error toast, and the success toast
        // only fires once both have landed.
        onSuccess: async () => {
          await clientGql(SETTINGS_MUTATION, {
            // The old slug still resolves post-rename (history fallback),
            // but address the forum by its fresh slug for correctness.
            s: newSlug || slug,
            ra: labels.admin,
            rh: labels.host,
            re: labels.elector,
          });
          setSaved(true);
          // A slug change moves the page itself: hard-navigate to the new
          // settings URL so the router, layout, and sidebar all re-resolve.
          if (newSlug && newSlug !== slug) {
            window.location.assign(`/f/${newSlug}/settings`);
          }
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <CollapsibleSection title="Forum profile">
        <IdentityFields
          slug={slug}
          value={identity}
          onChange={(patch) => setIdentity((s) => ({ ...s, ...patch }))}
        />
        <RoleLabelFields
          value={labels}
          onChange={(patch) => setLabels((s) => ({ ...s, ...patch }))}
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </CollapsibleSection>
    </form>
  );
}
