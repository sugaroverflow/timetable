"use client";

import { useState } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

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
 * this moment stop counting everywhere. Since queue v2 (2026-07-29) it
 * also resets everyone's Topic Queue — the fresh-eyes review at the start
 * of a term. The date may be in the past. Clearing it counts every heart
 * again. */
export function HeartsCutoffForm({
  slug,
  current,
}: {
  slug: string;
  current: string | null;
}) {
  const { run, busy } = useGqlAction();
  const [value, setValue] = useState(toLocalInputValue(current));

  function save(next: string | null) {
    void run(
      MUTATION,
      { s: slug, from: next ? new Date(next).toISOString() : null },
      {
        success: next ? "Hearts cutoff updated" : "Hearts cutoff cleared",
        errorFallback: "Could not save cutoff",
        onSuccess: () => {
          if (!next) setValue("");
        },
      },
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <h3 className="settings-subtitle">Hearts count from</h3>
        <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
          Hearts placed before this moment are ignored in every count and vote
          weight, and everyone&rsquo;s Topic Queue starts over — a fresh-eyes
          review of every topic, ❤️&rsquo;d ones included. Default is the
          forum&rsquo;s creation — everything counts.
        </p>
      </div>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) save(value);
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
          disabled={busy || !value}
        >
          Save cutoff
        </button>
        {current ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => save(null)}
          >
            Clear (count all hearts)
          </button>
        ) : null}
      </form>
    </div>
  );
}
