"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($s: String!, $from: String) {
  setHeartsCountFrom(idOrSlug: $s, countFrom: $from) { id heartsCountFrom }
}`;

/** Converts an ISO timestamp to the value a datetime-local input expects. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Admin control for the heart-count cutoff (QA #42): hearts placed before
 * this moment stop counting everywhere. The date may be in the past.
 * Clearing it counts every heart again. */
export function HeartsCutoffForm({
  slug,
  current,
}: {
  slug: string;
  current: string | null;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(toLocalInputValue(current));

  async function save(next: string | null) {
    try {
      await clientGql(MUTATION, {
        s: slug,
        from: next ? new Date(next).toISOString() : null,
      });
      toast(next ? "Hearts cutoff updated" : "Hearts cutoff cleared");
      if (!next) setValue("");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save cutoff");
    }
  }

  return (
    <div className="card stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Hearts count from</h2>
        <p>
          Hearts placed before this moment are ignored in every count and vote
          weight. Default is the forum&rsquo;s creation — everything counts.
        </p>
      </div>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) void save(value);
        }}
      >
        <input
          type="datetime-local"
          aria-label="Hearts count from"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ width: "auto" }}
        />
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || !value}
        >
          Save cutoff
        </button>
        {current ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={pending}
            onClick={() => void save(null)}
          >
            Clear (count all hearts)
          </button>
        ) : null}
      </form>
    </div>
  );
}
