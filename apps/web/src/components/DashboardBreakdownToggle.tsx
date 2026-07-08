"use client";

import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { clientGql } from "@/lib/clientGraphql";
import type { WeightedHeart } from "@/lib/feedTypes";

const QUERY = `query Breakdown($s: String!, $t: String!) {
  topicWeightedBreakdown(idOrSlug: $s, topicId: $t) {
    electorId electorName weight
  }
}`;

/** "Show ❤️ breakdown" under a dashboard leaderboard topic (QA #59 round
 * 3). Fetches the per-elector weights lazily on first expand. */
export function DashboardBreakdownToggle({
  slug,
  topicId,
}: {
  slug: string;
  topicId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<WeightedHeart[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (!next || rows !== null) return;
    try {
      const data = await clientGql<{
        topicWeightedBreakdown: WeightedHeart[] | null;
      }>(QUERY, { s: slug, t: topicId });
      setRows(data.topicWeightedBreakdown ?? []);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="dash-breakdown">
      <button
        type="button"
        className="thread-toggle"
        aria-expanded={expanded}
        onClick={() => void toggle()}
      >
        {expanded ? "Hide ❤️ breakdown ▾" : "Show ❤️ breakdown ▸"}
      </button>
      {expanded ? (
        failed ? (
          <div className="faint" style={{ fontSize: 12 }}>
            Couldn&rsquo;t load the breakdown.
          </div>
        ) : rows === null ? (
          <div className="faint" style={{ fontSize: 12 }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="faint" style={{ fontSize: 12 }}>
            No hearts yet.
          </div>
        ) : (
          <ul className="dash-breakdown-list">
            {rows.map((w) => (
              <li key={w.electorId} className="row" style={{ gap: 8 }}>
                <Avatar name={w.electorName} small />
                <span style={{ flex: 1 }}>{w.electorName ?? "Elector"}</span>
                <span className="mono">
                  {w.weight > 0 ? `1/${Math.round(1 / w.weight)}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
