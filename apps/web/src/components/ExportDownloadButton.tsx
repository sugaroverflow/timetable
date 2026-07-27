"use client";

import { useState } from "react";

import { clientApi } from "@/lib/clientApi";

/** Downloads the role-filtered JSON export from the REST endpoint. A plain
 * <a href> can't carry the Clerk bearer header, so this fetches the blob
 * and hands it to the browser as a file. */
export function ExportDownloadButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await clientApi(`/api/timetables/${slug}/export`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: "center" }}>
      <button className="btn" onClick={download} disabled={busy}>
        {busy ? "Preparing…" : "Download export"}
      </button>
      {error ? <span className="faint">{error}</span> : null}
    </div>
  );
}
