"use client";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function LocationFilter({
  value,
  locations,
}: {
  value: string;
  locations: string[];
}) {
  const setParam = useSetSearchParam();

  return (
    <select
      value={value}
      onChange={(e) => setParam("location", e.target.value)}
      aria-label="Filter by location"
    >
      <option value="">All locations</option>
      {locations.map((loc) => (
        <option key={loc} value={loc}>
          {loc}
        </option>
      ))}
    </select>
  );
}
