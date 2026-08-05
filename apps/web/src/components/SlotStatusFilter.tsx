"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** The calendar wears two hats — upcoming events and availability
 * workbench (QA 2026-08-05). This filter gives each its own view: Sessions
 * (pencilled/confirmed) or Open slots (nothing planned yet), with the
 * unified chronology as the default. */
export function SlotStatusFilter({ value }: { value: string }) {
  const setParam = useSetSearchParam();

  return (
    <SelectMinimal
      value={value}
      onChange={(e) => setParam("show", e.target.value)}
      aria-label="Filter by slot state"
    >
      <option value="">All slots</option>
      <option value="sessions">Sessions</option>
      <option value="open">Open slots</option>
    </SelectMinimal>
  );
}
