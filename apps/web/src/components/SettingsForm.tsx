"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation Settings(
  $s: String!, $ra: String, $rh: String, $re: String, $tp: String, $ts: String, $cover: String,
  $dnt: Boolean, $dr: Boolean, $da: Boolean
) {
  updateTimetableSettings(
    idOrSlug: $s
    roleLabelAdmin: $ra
    roleLabelHost: $rh
    roleLabelElector: $re
    themePrimary: $tp
    themeSecondary: $ts
    coverImageUrl: $cover
    digestNewTopics: $dnt
    digestReplies: $dr
    digestActivity: $da
  ) { id }
}`;

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: { primary?: string; secondary?: string };
  coverImageUrl?: string | null;
  digestDefaults?: {
    digestNewTopics?: boolean;
    digestReplies?: boolean;
    digestActivity?: boolean;
  };
};

function applyThemeVars(primary: string, secondary: string) {
  const root = document.documentElement.style;
  root.setProperty("--primary", primary);
  root.setProperty("--primary-soft", primary + "1a");
  root.setProperty("--primary-ink", "#ffffff");
  root.setProperty("--host-ink", secondary);
  root.setProperty("--host-wash", secondary + "15");
  root.setProperty("--host-line", secondary + "40");
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

  const initialPrimary = current.theme?.primary ?? "#2f54eb";
  const initialSecondary = current.theme?.secondary ?? "#5b7bff";

  const [admin, setAdmin] = useState(current.roleLabels?.admin ?? "Admin");
  const [host, setHost] = useState(current.roleLabels?.host ?? "Host");
  const [elector, setElector] = useState(
    current.roleLabels?.elector ?? "Elector",
  );
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);
  const [cover, setCover] = useState(current.coverImageUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [digestTopics, setDigestTopics] = useState(
    current.digestDefaults?.digestNewTopics ?? false,
  );
  const [digestReplies, setDigestReplies] = useState(
    current.digestDefaults?.digestReplies ?? false,
  );
  const [digestActivity, setDigestActivity] = useState(
    current.digestDefaults?.digestActivity ?? false,
  );

  useEffect(() => {
    applyThemeVars(initialPrimary, initialSecondary);
    // apply the saved theme once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function discard() {
    setAdmin(current.roleLabels?.admin ?? "Admin");
    setHost(current.roleLabels?.host ?? "Host");
    setElector(current.roleLabels?.elector ?? "Elector");
    setPrimary(initialPrimary);
    setSecondary(initialSecondary);
    setCover(current.coverImageUrl ?? "");
    setDigestTopics(current.digestDefaults?.digestNewTopics ?? false);
    setDigestReplies(current.digestDefaults?.digestReplies ?? false);
    setDigestActivity(current.digestDefaults?.digestActivity ?? false);
    applyThemeVars(initialPrimary, initialSecondary);
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
          disabled={pending || uploadingCover}
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
