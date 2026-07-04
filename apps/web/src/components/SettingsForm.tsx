"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation Settings(
  $s: String!, $ra: String, $rh: String, $re: String, $tp: String, $ts: String, $cover: String
) {
  updateTimetableSettings(
    idOrSlug: $s
    roleLabelAdmin: $ra
    roleLabelHost: $rh
    roleLabelElector: $re
    themePrimary: $tp
    themeSecondary: $ts
    coverImageUrl: $cover
  ) { id }
}`;

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: { primary?: string; secondary?: string };
  coverImageUrl?: string | null;
};

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

  const [admin, setAdmin] = useState(current.roleLabels?.admin ?? "Admin");
  const [host, setHost] = useState(current.roleLabels?.host ?? "Host");
  const [elector, setElector] = useState(
    current.roleLabels?.elector ?? "Elector",
  );
  const [primary, setPrimary] = useState(current.theme?.primary ?? "#2f54eb");
  const [secondary, setSecondary] = useState(
    current.theme?.secondary ?? "#5b7bff",
  );
  const [cover, setCover] = useState(current.coverImageUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (primary) {
      document.documentElement.style.setProperty('--primary', primary);
      document.documentElement.style.setProperty('--primary-soft', primary + '1a');
    }
    if (secondary) {
      document.documentElement.style.setProperty('--host-ink', secondary);
      document.documentElement.style.setProperty('--host-wash', secondary + '15');
      document.documentElement.style.setProperty('--host-line', secondary + '40');
    }
  }, []); // run once on mount

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

      <div className="row wrap">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="tp">Primary color</label>
          <input
            id="tp"
            type="color"
            value={primary}
            onChange={(e) => {
              setPrimary(e.target.value);
              document.documentElement.style.setProperty('--primary', e.target.value);
              document.documentElement.style.setProperty('--primary-soft', e.target.value + '1a');
              document.documentElement.style.setProperty('--primary-ink', '#ffffff');
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
              document.documentElement.style.setProperty('--host-ink', e.target.value);
              document.documentElement.style.setProperty('--host-wash', e.target.value + '15');
              document.documentElement.style.setProperty('--host-line', e.target.value + '40');
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

      <button
        className="btn btn-primary"
        type="submit"
        disabled={pending || uploadingCover}
        style={{ marginTop: 12 }}
      >
        {uploadingCover
          ? "Uploading…"
          : pending
            ? "Saving…"
            : saved
              ? "Saved"
              : "Save settings"}
      </button>
    </form>
  );
}
