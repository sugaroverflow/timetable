"use client";

import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { PersonChip } from "@/components/PersonChip";
import type { WeightedHeart } from "@/lib/feedTypes";

type SortKey = "name" | "l1" | "l2" | "devotion" | "heartedAt";

function fmt(n: number): string {
  return n.toFixed(2);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/**
 * Sortable per-elector ❤️ breakdown (product feedback round 2). One row per
 * elector with their L1 (1/n), L2 (1/√n) and devotion contributions plus
 * when they hearted; each numeric column sums (in the footer) to the topic's
 * corresponding score. Elector names open their profile card.
 */
export function BreakdownTable({
  slug,
  rows,
}: {
  slug: string;
  rows: WeightedHeart[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("l1");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text sorts read best ascending; weights/dates descending.
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = (a.electorName ?? "").localeCompare(b.electorName ?? "");
        break;
      case "l1":
        cmp = a.weight - b.weight;
        break;
      case "l2":
        cmp = a.l2Weight - b.l2Weight;
        break;
      case "devotion":
        cmp = a.devotionWeight - b.devotionWeight;
        break;
      case "heartedAt":
        cmp = Date.parse(a.heartedAt) - Date.parse(b.heartedAt);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  function header(key: SortKey, label: string) {
    const active = sortKey === key;
    return (
      <th
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          className={active ? "th-sort th-sort-active" : "th-sort"}
          onClick={() => toggleSort(key)}
        >
          {label}
          <span aria-hidden className="th-sort-arrow">
            {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
          </span>
        </button>
      </th>
    );
  }

  const sum = (pick: (w: WeightedHeart) => number) =>
    rows.reduce((acc, w) => acc + pick(w), 0);

  return (
    <div className="table-wrap">
      <table className="data-table sortable-table breakdown-table">
        <thead>
          <tr>
            {header("name", "Elector")}
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
                  <span className="row" style={{ gap: 6, alignItems: "center" }}>
                    <Avatar name={w.electorName} small />
                    {w.electorName ?? "Elector"}
                  </span>
                </PersonChip>
              </td>
              <td className="mono">{fmt(w.weight)}</td>
              <td className="mono">{fmt(w.l2Weight)}</td>
              <td className="mono">{fmt(w.devotionWeight)}</td>
              <td className="mono">{fmtDate(w.heartedAt)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="breakdown-sums">
            <td>
              Σ · {rows.length} heart{rows.length === 1 ? "" : "s"}
            </td>
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
