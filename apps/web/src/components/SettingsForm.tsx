"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation Settings(
  $s: String!, $ra: String, $rh: String, $re: String, $tp: String, $ts: String
) {
  updateTimetableSettings(
    idOrSlug: $s
    roleLabelAdmin: $ra
    roleLabelHost: $rh
    roleLabelElector: $re
    themePrimary: $tp
    themeSecondary: $ts
  ) { id }
}`;

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: { primary?: string; secondary?: string };
};

export function SettingsForm({
  slug,
  current,
}: {
  slug: string;
  current: SettingsValues;
}) {
  const router = useRouter();
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
      });
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Labels &amp; theme</h2>

      <div className="field">
        <label htmlFor="ra">Admin label</label>
        <input id="ra" value={admin} onChange={(e) => setAdmin(e.target.value)} />
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
            onChange={(e) => setPrimary(e.target.value)}
            style={{ width: 64, padding: 2, height: 38 }}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ts">Secondary color</label>
          <input
            id="ts"
            type="color"
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
            style={{ width: 64, padding: 2, height: 38 }}
          />
        </div>
      </div>

      <button
        className="btn btn-primary"
        type="submit"
        disabled={pending}
        style={{ marginTop: 12 }}
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save settings"}
      </button>
    </form>
  );
}
