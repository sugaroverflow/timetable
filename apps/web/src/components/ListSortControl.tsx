"use client";

import type { ManagedSortOption } from "@/lib/managedTopicSort";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Sort dropdown for the managed-topic lists (My Topics, Pending Topics) —
 * like FeedSortControl but with page-specific options and no shuffle seed. */
export function ListSortControl({
  value,
  options,
}: {
  value: string;
  options: ManagedSortOption[];
}) {
  const setParam = useSetSearchParam();

  return (
    <select
      id="sort"
      aria-label="Sort topics"
      value={value}
      onChange={(e) => setParam("sort", e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
