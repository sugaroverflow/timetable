"use client";

import { ChevronDown } from "lucide-react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Filter activity entries by the actor's role (QA #59). */
export function ActivityRoleFilter({
  value,
  options,
}: {
  value: string;
  options: { role: string; label: string }[];
}) {
  const setParam = useSetSearchParam();

  return (
    <span className="select-minimal">
      <ChevronDown size={14} aria-hidden />
      <select
        id="activity-role"
        aria-label="Filter by actor role"
        value={value}
        onChange={(e) => setParam("role", e.target.value)}
      >
        <option value="">All roles</option>
        {options.map((o) => (
          <option key={o.role} value={o.role}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
