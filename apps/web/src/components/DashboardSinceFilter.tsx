"use client";

import { CalendarDays } from "lucide-react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Start date for the elector-activity table (QA #59 round 3). Defaults to
 * the hearts cutoff; clearing it falls back to that default. */
export function DashboardSinceFilter({ value }: { value: string }) {
  const setParam = useSetSearchParam();

  return (
    <span className="select-minimal">
      <CalendarDays size={14} aria-hidden />
      <input
        aria-label="Count activity since"
        type="date"
        value={value}
        onChange={(e) => setParam("since", e.target.value)}
      />
    </span>
  );
}
