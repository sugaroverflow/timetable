"use client";

import { CalendarDays } from "lucide-react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Start/end date pickers for the activity log (QA #59). Values ride in
 * the URL so the server filters the query. */
export function ActivityDateFilter({ from, to }: { from: string; to: string }) {
  const setParam = useSetSearchParam();

  return (
    <span className="select-minimal">
      <CalendarDays size={14} aria-hidden />
      <input
        id="activity-from"
        aria-label="From date"
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => setParam("from", e.target.value)}
      />
      <span className="faint" aria-hidden>
        –
      </span>
      <input
        id="activity-to"
        aria-label="To date"
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => setParam("to", e.target.value)}
      />
    </span>
  );
}
