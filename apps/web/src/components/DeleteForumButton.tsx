"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { clientApi } from "@/lib/clientApi";

/** Two-step destructive control: "Delete" arms an inline type-the-slug
 * confirmation; only an exact match enables the real delete. */
export function DeleteForumButton({ id, slug }: { id: string; slug: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await clientApi(`/api/timetables/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <button className="btn btn-sm" onClick={() => setArmed(true)}>
        Delete…
      </button>
    );
  }

  return (
    <div className="row" style={{ gap: 6, alignItems: "center" }}>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={`Type "${slug}" to confirm`}
        aria-label={`Type ${slug} to confirm deletion`}
        style={{ width: 180 }}
      />
      <button
        className="btn btn-sm"
        disabled={typed !== slug || busy}
        onClick={confirmDelete}
      >
        {busy ? "Deleting…" : "Delete forever"}
      </button>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => {
          setArmed(false);
          setTyped("");
          setError(null);
        }}
      >
        Cancel
      </button>
      {error ? <span className="faint">{error}</span> : null}
    </div>
  );
}
