"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Heart } from "lucide-react";

import type { WeightedHeart } from "@/lib/feedTypes";

import { BreakdownTable } from "./BreakdownTable";

export function HostInsightsPanel({
  slug,
  weightedBreakdown,
}: {
  slug: string;
  weightedBreakdown: WeightedHeart[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible.Root
      className="host-panel"
      open={expanded}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger className="host-panel-toggle">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
        {expanded ? "Hide " : "Show "}
        <Heart size={14} fill="currentColor" aria-hidden /> breakdown
      </Collapsible.Trigger>

      <Collapsible.Panel>
        {weightedBreakdown.length === 0 ? (
          <div className="faint" style={{ fontSize: 12 }}>
            No hearts yet.
          </div>
        ) : (
          <BreakdownTable slug={slug} rows={weightedBreakdown} />
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
