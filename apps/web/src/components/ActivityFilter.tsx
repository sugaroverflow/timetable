"use client";

import { ACTION_LABELS } from "@/lib/activityLabels";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function ActivityFilter({
  value,
  actions,
}: {
  value: string;
  actions: string[];
}) {
  const setParam = useSetSearchParam();

  return (
    <>
      <label htmlFor="activity-filter">Action</label>
      <select
        id="activity-filter"
        aria-label="Filter by action type"
        value={value}
        onChange={(e) => setParam("action", e.target.value)}
      >
        <option value="">All actions</option>
        {actions.map((action) => (
          <option key={action} value={action}>
            {ACTION_LABELS[action] ?? action}
          </option>
        ))}
      </select>
    </>
  );
}
