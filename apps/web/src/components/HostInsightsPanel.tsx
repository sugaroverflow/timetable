"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight, Heart } from "lucide-react";

import type { WeightedHeart } from "@/lib/feedTypes";

import { Avatar } from "./Avatar";

export function HostInsightsPanel({
  weightedScore,
  heartCount,
  weightedBreakdown,
}: {
  weightedScore: number;
  heartCount: number;
  weightedBreakdown: WeightedHeart[];
}) {
  const [expanded, setExpanded] = useState(false);

  const maxWeight =
    weightedBreakdown.length > 0
      ? Math.max(...weightedBreakdown.map((w) => w.weight))
      : 1;

  const coveragePct = Math.min((weightedScore / 5.0) * 100, 100);

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
          {/* Coverage summary row */}
          <div className="coverage-row">
            <span className="coverage-num">{weightedScore.toFixed(2)}</span>
            <span style={{ fontSize: 13, color: "var(--host-ink)" }}>
              {heartCount} heart{heartCount === 1 ? "" : "s"}
            </span>
            <div className="coverage-bar">
              <div
                className="coverage-fill"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>

          {/* Per-elector rows */}
          {weightedBreakdown.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>
              No hearts yet.
            </div>
          ) : (
            weightedBreakdown.map((w) => {
              const barPct =
                maxWeight > 0 ? (w.weight / maxWeight) * 100 : 0;
              const fractionLabel =
                w.weight > 0 ? `1/${Math.round(1 / w.weight)}` : null;

              return (
                <div className="voter-row" key={w.electorId}>
                  <Avatar name={w.electorName} small />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {w.electorName ?? "Elector"}
                  </span>
                  <div className="voter-bar">
                    <div
                      className="voter-bar-fill"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  {fractionLabel !== null ? (
                    <span className="voter-weight">{fractionLabel}</span>
                  ) : null}
                </div>
              );
            })
          )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
