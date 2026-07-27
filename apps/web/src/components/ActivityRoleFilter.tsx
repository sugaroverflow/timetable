"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
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
    <SelectMinimal
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
    </SelectMinimal>
  );
}
