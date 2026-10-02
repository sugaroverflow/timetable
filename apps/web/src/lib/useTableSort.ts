import { useState } from "react";

export type SortDir = "asc" | "desc";

/**
 * Click-to-sort state for the sortable tables (2026-08-05 — this exact
 * state machine was hand-copied in BreakdownTable, both activity tables,
 * and the hearted-topics sub-table): first click on a column applies its
 * natural direction (ascending for text columns, descending for counts
 * and dates), clicking the active column flips it.
 *
 * `compare` returns the ASCENDING comparison for a key; `sortRows`
 * applies the current direction. `headerProps` feeds `<SortHeader>`:
 *
 *   <SortHeader label="Topics" {...headerProps("topics")} />
 */
export function useTableSort<K extends string, Row>(opts: {
  initial: K;
  /** Columns whose first click sorts ascending (text columns). */
  ascendingKeys?: readonly K[];
  compare: (a: Row, b: Row, key: K) => number;
}) {
  const [sortKey, setSortKey] = useState<K>(opts.initial);
  const [dir, setDir] = useState<SortDir>(
    opts.ascendingKeys?.includes(opts.initial) ? "asc" : "desc",
  );

  function toggleSort(key: K) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(opts.ascendingKeys?.includes(key) ? "asc" : "desc");
    }
  }

  const sortRows = (rows: readonly Row[]): Row[] =>
    [...rows].sort((a, b) => {
      const cmp = opts.compare(a, b, sortKey);
      return dir === "asc" ? cmp : -cmp;
    });

  const headerProps = (key: K) => ({
    active: sortKey === key,
    dir,
    onToggle: () => toggleSort(key),
  });

  return { sortKey, dir, toggleSort, sortRows, headerProps };
}
