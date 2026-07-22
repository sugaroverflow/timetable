"use client";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Start/end date pickers for the activity log (QA #59). Values ride in
 * the URL so the server filters the query. */
export function ActivityDateFilter({ from, to }: { from: string; to: string }) {
  const setParam = useSetSearchParam();

  return (
    <>
      <label htmlFor="activity-from">From</label>
      <input
        id="activity-from"
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => setParam("from", e.target.value)}
      />
      <label htmlFor="activity-to">To</label>
      <input
        id="activity-to"
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => setParam("to", e.target.value)}
      />
    </>
  );
}
