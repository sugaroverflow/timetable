"use client";

import { Avatar } from "@/components/Avatar";
import { PersonChip } from "@/components/PersonChip";
import { SortHeader } from "@/components/SortHeader";
import { formatShortDate } from "@/lib/dates";
import type { WeightedHeart } from "@/lib/feedTypes";
import { useTableSort } from "@/lib/useTableSort";

type SortKey = "name" | "l1" | "l2" | "devotion" | "heartedAt";

function fmt(n: number): string {
  return n.toFixed(2);
}

function compareRows(a: WeightedHeart, b: WeightedHeart, key: SortKey) {
  switch (key) {
    case "name":
      return (a.electorName ?? "").localeCompare(b.electorName ?? "");
    case "l1":
      return a.weight - b.weight;
    case "l2":
      return a.l2Weight - b.l2Weight;
    case "devotion":
      return a.devotionWeight - b.devotionWeight;
    case "heartedAt":
      return Date.parse(a.heartedAt) - Date.parse(b.heartedAt);
  }
}

/**
 * Sortable per-elector ❤️ breakdown (product feedback round 2). One row per
 * elector with their L1 (1/n), L2 (1/√n) and devotion contributions plus
 * when they hearted; each numeric column sums (in the footer) to the topic's
 * corresponding score. Elector names link to their person page.
 */
export function BreakdownTable({
  slug,
  rows,
  electorLabel = "Elector",
}: {
  slug: string;
  rows: WeightedHeart[];
  /** The forum's custom role label (QA 2026-07-28). */
  electorLabel?: string;
}) {
  const { sortRows, headerProps } = useTableSort<SortKey, WeightedHeart>({
    initial: "l1",
    ascendingKeys: ["name"],
    compare: compareRows,
  });
  const sorted = sortRows(rows);

  function header(key: SortKey, label: string) {
    return <SortHeader label={label} {...headerProps(key)} />;
  }

  const sum = (pick: (w: WeightedHeart) => number) =>
    rows.reduce((acc, w) => acc + pick(w), 0);

  return (
    <div className="table-wrap">
      <table className="data-table breakdown-table">
        <thead>
          <tr>
            {header("name", electorLabel)}
            {header("l1", "L1")}
            {header("l2", "L2")}
            {header("devotion", "Devotion")}
            {header("heartedAt", "Hearted")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => (
            <tr key={w.electorId}>
              <td>
                <PersonChip slug={slug} userId={w.electorId}>
                  <span
                    className="row"
                    style={{ gap: 6, alignItems: "center" }}
                  >
                    <Avatar name={w.electorName} image={w.electorImage} small />
                    {w.electorName ?? electorLabel}
                  </span>
                </PersonChip>
              </td>
              <td className="mono">{fmt(w.weight)}</td>
              <td className="mono">{fmt(w.l2Weight)}</td>
              <td className="mono">{fmt(w.devotionWeight)}</td>
              <td className="mono">
                {formatShortDate(w.heartedAt, { year: true })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="breakdown-sums">
            <td>Σ · {rows.length} ❤️</td>
            <td className="mono">{fmt(sum((w) => w.weight))}</td>
            <td className="mono">{fmt(sum((w) => w.l2Weight))}</td>
            <td className="mono">{fmt(sum((w) => w.devotionWeight))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
