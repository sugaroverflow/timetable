"use client";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

const OPTIONS = [
  { value: "all", label: "All electors" },
  { value: "active", label: "Any activity" },
  { value: "quiet", label: "No activity" },
  { value: "no_hearts", label: "No hearts" },
  { value: "no_comments", label: "No comments" },
  { value: "no_availability", label: "No availability" },
];

export function DashboardActivityFilter({ value }: { value: string }) {
  const setParam = useSetSearchParam();

  return (
    <select
      aria-label="Filter elector activity"
      value={value}
      onChange={(e) => {
        // "all" is the default: it rides as no param at all.
        const next = e.target.value;
        setParam("activity", next === "all" ? "" : next);
      }}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
