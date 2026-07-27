"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
import type { QueueCounts } from "@/lib/feedPage";
import { NORM_MODES } from "@/lib/normModes";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** "Queue (43)" — or "Queue (43+5🆕)" when topics were published since the
 * viewer's current round started. */
export function queueOptionLabel(queue: QueueCounts): string {
  const base = queue.remaining - queue.remainingNew;
  return queue.remainingNew > 0
    ? `Queue (${base}+${queue.remainingNew}🆕)`
    : `Queue (${queue.remaining})`;
}

export function FeedSortControl({
  value,
  queue = null,
}: {
  value: string;
  /** Non-null shows the elector-only Queue mode option. */
  queue?: QueueCounts | null;
}) {
  const setParam = useSetSearchParam();

  function change(next: string) {
    setParam("sort", next, {
      resetPage: true,
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
      {queue ? <option value="queue">{queueOptionLabel(queue)}</option> : null}
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
    </SelectMinimal>
  );
}
