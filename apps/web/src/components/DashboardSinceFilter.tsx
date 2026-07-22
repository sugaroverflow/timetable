"use client";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Start date for the elector-activity table (QA #59 round 3). Defaults to
 * the hearts cutoff; clearing it falls back to that default. */
export function DashboardSinceFilter({ value }: { value: string }) {
  const setParam = useSetSearchParam();

  return (
    <>
      <label htmlFor="dash-since">Since</label>
      <input
        id="dash-since"
        type="date"
        value={value}
        onChange={(e) => setParam("since", e.target.value)}
      />
    </>
  );
}
