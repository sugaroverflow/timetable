"use client";

import { NORM_MODES } from "@/lib/normModes";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function FeedSortControl({ value }: { value: string }) {
  const setParam = useSetSearchParam();

  function change(next: string) {
    setParam("sort", next, {
      resetPage: true,
      // Random sort gets a fresh shuffle seed per selection; the seed rides
      // in the URL so infinite-scroll pages stay consistent (QA #59).
      mutate: (params) => {
        if (next === "random") {
          params.set("seed", Math.random().toString(36).slice(2, 10));
        } else {
          params.delete("seed");
        }
      },
    });
  }

  return (
    <select
      aria-label="Sort topics"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="random">Random</option>
      <optgroup label="By hearts">
        {NORM_MODES.map((mode) => (
          <option key={mode.key} value={mode.key} title={mode.description}>
            {mode.symbol} — {mode.label}
          </option>
        ))}
      </optgroup>
      <option value="comments">Latest comments</option>
      <option value="recent">Newest</option>
    </select>
  );
}
