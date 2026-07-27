"use client";

import { ChevronDown } from "lucide-react";

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
    <span className="select-minimal">
      <ChevronDown size={14} aria-hidden />
      <select
        id="sort"
        aria-label="Sort topics"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="random">Shuffle</option>
        <option value="recent">Newest</option>
        <option value="comments">Latest comments</option>
        <optgroup label="By ❤️">
          {NORM_MODES.map((mode) => (
            <option key={mode.key} value={mode.key} title={mode.description}>
              {mode.symbol} — {mode.label}
            </option>
          ))}
        </optgroup>
      </select>
    </span>
  );
}
