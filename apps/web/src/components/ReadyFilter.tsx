"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** Pending Topics view filter: the default shows only topics their host
 * marked ready to publish; the rest of the queue (still drafting) stays a
 * selection away. Counts keep the hidden portion honest. */
export function ReadyFilter({
  value,
  readyCount,
  draftingCount,
}: {
  value: string;
  readyCount: number;
  draftingCount: number;
}) {
  const setParam = useSetSearchParam();

  return (
    <SelectMinimal
      value={value}
      onChange={(e) => setParam("show", e.target.value)}
      aria-label="Filter by readiness"
    >
      <option value="">Ready to publish ({readyCount})</option>
      <option value="drafting">Still drafting ({draftingCount})</option>
      <option value="all">All ({readyCount + draftingCount})</option>
    </SelectMinimal>
  );
}
