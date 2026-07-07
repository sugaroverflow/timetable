"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import { themeVars, type DigestSettings } from "@/lib/timetableSettings";

const MUTATION = `mutation Settings(
  $s: String!, $ra: String, $rh: String, $re: String, $tp: String, $ts: String, $cover: String,
  $icon: String, $dnt: Boolean, $dr: Boolean, $da: Boolean
) {
  updateTimetableSettings(
    idOrSlug: $s
    roleLabelAdmin: $ra
    roleLabelHost: $rh
    roleLabelElector: $re
    themePrimary: $tp
    themeSecondary: $ts
    coverImageUrl: $cover
    iconUrl: $icon
    digestNewTopics: $dnt
    digestReplies: $dr
    digestActivity: $da
  ) { id }
}`;

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: { primary?: string; secondary?: string };
  coverImageUrl?: string | null;
  iconUrl?: string | null;
  digestDefaults?: DigestSettings;
};

function applyThemeVars(primary: string, secondary: string) {
  // The timetable shell (<main>) carries the saved theme as inline CSS vars,
  // which shadow anything set on <html> — write the preview where it wins.
  const target =
    document.querySelector<HTMLElement>("main.container") ??
    document.documentElement;
  for (const [name, value] of Object.entries(themeVars(primary, secondary))) {
    target.style.setProperty(name, value);
  }
}

export function SettingsForm({
  slug,
  current,
}: {
  slug: string;
  current: SettingsValues;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Single source for both the initial state and what Discard restores.
  const initial = {
    admin: current.roleLabels?.admin ?? "Admin",
    host: current.roleLabels?.host ?? "Host",
    elector: current.roleLabels?.elector ?? "Elector",
    primary: current.theme?.primary ?? "#2f54eb",
    secondary: current.theme?.secondary ?? "#5b7bff",
    cover: current.coverImageUrl ?? "",
    icon: current.iconUrl ?? "",
    digestTopics: current.digestDefaults?.digestNewTopics ?? false,
    digestReplies: current.digestDefaults?.digestReplies ?? false,
    digestActivity: current.digestDefaults?.digestActivity ?? false,
  };

  const [admin, setAdmin] = useState(initial.admin);
  const [host, setHost] = useState(initial.host);
  const [elector, setElector] = useState(initial.elector);
  const [primary, setPrimary] = useState(initial.primary);
  const [secondary, setSecondary] = useState(initial.secondary);
  const [cover, setCover] = useState(initial.cover);
  const [icon, setIcon] = useState(initial.icon);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [digestTopics, setDigestTopics] = useState(initial.digestTopics);
  const [digestReplies, setDigestReplies] = useState(initial.digestReplies);
  const [digestActivity, setDigestActivity] = useState(initial.digestActivity);

  function discard() {
    setAdmin(initial.admin);
    setHost(initial.host);
    setElector(initial.elector);
    setPrimary(initial.primary);
    setSecondary(initial.secondary);
    setCover(initial.cover);
    setIcon(initial.icon);
    setDigestTopics(initial.digestTopics);
    setDigestReplies(initial.digestReplies);
    setDigestActivity(initial.digestActivity);
    applyThemeVars(initial.primary, initial.secondary);
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await clientGql(MUTATION, {
        s: slug,
        ra: admin,
        rh: host,
        re: elector,
        tp: primary,
        ts: secondary,
        cover: cover.trim() || null,
        icon: icon.trim() || null,
        dnt: digestTopics,
        dr: digestReplies,
        da: digestActivity,
      });
      setSaved(true);
      toast("Settings saved");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Labels &amp; theme</h2>

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

      <div className="row wrap">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tp">Primary color</label>
          <input
            id="tp"
            type="color"
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              applyThemeVars(e.target.value, secondary);
            }}
            style={{ width: 64, padding: 2, height: 38 }}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ts">Secondary color</label>
          <input
            id="ts"
            type="color"
            value={secondary}
            onChange={(e) => {
              setSecondary(e.target.value);
              applyThemeVars(primary, e.target.value);
            }}
            style={{ width: 64, padding: 2, height: 38 }}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="cover"
          label="Cover image URL"
          value={cover}
          onChange={setCover}
          purpose="timetable-cover"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingCover}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="icon"
          label="Icon URL (square, shown in the timetable menu)"
          value={icon}
          onChange={setIcon}
          purpose="timetable-icon"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingIcon}
        />
      </div>

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

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || uploadingCover || uploadingIcon}
        >
          {uploadingCover
            ? "Uploading…"
            : pending
              ? "Saving…"
              : saved
                ? "Saved"
                : "Save settings"}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={discard}
          disabled={pending}
        >
          Discard
        </button>
      </div>
    </form>
  );
}
