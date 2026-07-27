"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  BreakdownCaret,
  BreakdownPanelBody,
} from "@/components/BreakdownPanel";
import { NORM_MODES, type NormKey } from "@/lib/normModes";
import { topicPath } from "@/lib/topicPath";

export type LeaderboardEntry = {
  id: string;
  title: string;
  slug: string | null;
  hostName: string | null;
  hostSlug: string | null;
  weightedScore: number;
  l2Score: number;
  devotionScore: number;
  heartCount: number;
  lastHeartAt: string | null;
};

function scoreFor(entry: LeaderboardEntry, key: NormKey): number {
  switch (key) {
    case "raw":
      return entry.heartCount;
    case "l2":
      return entry.l2Score;
    case "devotion":
      return entry.devotionScore;
    default:
      return entry.weightedScore; // l1
  }
}

/** One leaderboard entry with the ❤️-breakdown disclosure triangle inline
 * before the topic name (QA 2026-07-27 — replaced a per-row labelled
 * "Show ❤️ breakdown" line). */
function LeaderboardRow({
  entry,
  norm,
  slug,
  hostLabel,
}: {
  entry: LeaderboardEntry;
  norm: NormKey;
  slug: string;
  hostLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const href = topicPath(slug, entry.hostSlug, entry.slug);
  const score = scoreFor(entry, norm);
  return (
    <li style={{ fontSize: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 4, alignItems: "center" }}>
          <BreakdownCaret open={open} onToggle={() => setOpen(!open)} />
          <span>
            {href ? <Link href={href}>{entry.title}</Link> : entry.title}{" "}
            <span className="faint">· {entry.hostName ?? hostLabel}</span>
          </span>
        </span>
        <span className="mono" style={{ textAlign: "right" }}>
          {norm === "raw" ? score : score.toFixed(2)}
          {entry.lastHeartAt ? (
            <span className="faint" style={{ display: "block", fontSize: 11 }}>
              last <Heart size={14} fill="currentColor" aria-hidden />{" "}
              {new Date(entry.lastHeartAt).toLocaleDateString()}
            </span>
          ) : null}
        </span>
      </div>
      {open ? (
        <div className="dash-breakdown">
          <BreakdownPanelBody slug={slug} topicId={entry.id} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * "All topics by ❤️" leaderboard with a normalisation switcher (product
 * feedback round 1). The API sends every norm per topic; switching re-sorts
 * and re-labels client-side without a round-trip.
 */
export function TopicLeaderboard({
  slug,
  hostLabel,
  entries,
}: {
  slug: string;
  hostLabel: string;
  entries: LeaderboardEntry[];
}) {
  const [norm, setNorm] = useState<NormKey>("l1");
  const mode = NORM_MODES.find((m) => m.key === norm) ?? NORM_MODES[0]!;
  const sorted = [...entries].sort(
    (a, b) => scoreFor(b, norm) - scoreFor(a, norm),
  );

  return (
    <div className="card">
      <div
        className="row wrap"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>All topics by ❤️</h3>
        <select
          aria-label="Vote normalisation"
          value={norm}
          onChange={(e) => setNorm(e.target.value as NormKey)}
        >
          {NORM_MODES.map((m) => (
            <option key={m.key} value={m.key} title={m.description}>
              {m.symbol} — {m.label}
            </option>
          ))}
        </select>
      </div>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        {mode.description}
      </p>
      {sorted.length === 0 ? (
        <p className="faint" style={{ fontSize: 13 }}>
          No published topics yet.
        </p>
      ) : (
        <ul className="list">
          {sorted.map((t) => (
            <LeaderboardRow
              key={t.id}
              entry={t}
              norm={norm}
              slug={slug}
              hostLabel={hostLabel}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
