"use client";

import { useState } from "react";

import type { FeedComment, WeightedHeart } from "@/lib/feedTypes";

import { Avatar } from "./Avatar";

export function HostInsightsPanel({
  weightedScore,
  heartCount,
  weightedBreakdown,
  hostComments,
}: {
  weightedScore: number;
  heartCount: number;
  weightedBreakdown: WeightedHeart[];
  hostComments: FeedComment[];
}) {
  const [expanded, setExpanded] = useState(false);

  const maxWeight =
    weightedBreakdown.length > 0
      ? Math.max(...weightedBreakdown.map((w) => w.weight))
      : 1;

  const coveragePct = Math.min((weightedScore / 5.0) * 100, 100);

  return (
    <div className="host-panel">
      <button
        className="host-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? "Hide breakdown ▾" : "Show vote breakdown ▸"}
      </button>

      {expanded && (
        <>
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

          {/* Host-only comment thread */}
          {hostComments.length > 0 && (
            <div className="host-thread">
              <div className="host-thread-head">🔒 Host thread</div>
              {hostComments.map((c) => (
                <div key={c.id} className="comment" style={{ marginBottom: 8 }}>
                  <Avatar name={c.authorName} small />
                  <div className="comment-main">
                    <div className="comment-meta">
                      <span className="who">{c.authorName ?? "Someone"}</span>
                    </div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
