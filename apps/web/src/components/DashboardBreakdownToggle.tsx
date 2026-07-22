"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Heart } from "lucide-react";

import { BreakdownTable } from "@/components/BreakdownTable";
import { clientGql } from "@/lib/clientGraphql";
import type { WeightedHeart } from "@/lib/feedTypes";

const QUERY = `query Breakdown($s: String!, $t: String!) {
  topicWeightedBreakdown(idOrSlug: $s, topicId: $t) {
    electorId electorName weight l2Weight devotionWeight heartedAt
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

  async function handleOpenChange(next: boolean) {
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
    <Collapsible.Root
      className="dash-breakdown"
      open={expanded}
      onOpenChange={(next) => void handleOpenChange(next)}
    >
      <Collapsible.Trigger className="thread-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        {expanded ? "Hide " : "Show "}
        <Heart size={14} fill="currentColor" aria-hidden /> breakdown
      </Collapsible.Trigger>
      <Collapsible.Panel>
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
          <BreakdownTable slug={slug} rows={rows} />
          )
        ) : null}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
