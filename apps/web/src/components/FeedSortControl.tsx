"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
import { NORM_MODES } from "@/lib/normModes";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function FeedSortControl({ value }: { value: string }) {
  const setParam = useSetSearchParam();

  function change(next: string) {
    setParam("sort", next, {
      // Random sort gets a fresh shuffle seed per selection; the seed rides
      // in the URL so infinite-scroll pages stay consistent (QA #59).
      mutate: (params) => {
        if (next === "random") {
          params.set("shuffle", Math.random().toString(36).slice(2, 10));
        } else {
          params.delete("shuffle");
        }
      },
    });
  }

  return (
    <SelectMinimal
      id="sort"
      aria-label="Sort topics"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="random">🔀 Shuffle</option>
      <option value="created">📚 Latest Created</option>
      <option value="recent">✏️ Latest Updated</option>
      <option value="comments">💬 Latest Comments</option>
      <optgroup label="By ❤️">
        {NORM_MODES.map((mode) => (
          <option key={mode.key} value={mode.key} title={mode.description}>
            {mode.symbol} — {mode.label}
          </option>
        ))}
      </optgroup>
    </SelectMinimal>
  );
}
