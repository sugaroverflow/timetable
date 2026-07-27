"use client";

import { ChevronDown } from "lucide-react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

// "No availability" is omitted while timeslots are unreleased.
const OPTIONS = [
  { value: "active", label: "Any activity" },
  { value: "quiet", label: "No activity" },
  { value: "no_hearts", label: "No ❤️s" },
  { value: "no_comments", label: "No comments" },
];

export function DashboardActivityFilter({
  value,
  allLabel = "All electors",
}: {
  value: string;
  allLabel?: string;
}) {
  const setParam = useSetSearchParam();

  return (
    <span className="select-minimal">
      <ChevronDown size={14} aria-hidden />
      <select
        aria-label="Filter elector activity"
        value={value}
        onChange={(e) => {
          // "all" is the default: it rides as no param at all.
          const next = e.target.value;
          setParam("activity", next === "all" ? "" : next);
        }}
      >
        <option value="all">{allLabel}</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
