"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BreakdownToggle } from "@/components/BreakdownToggle";
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

/**
 * "All topics by hearts" leaderboard with a normalisation switcher (product
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
        <h3 style={{ margin: 0, fontSize: 15 }}>All topics by hearts</h3>
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
          {sorted.map((t) => {
            const href = topicPath(slug, t.hostSlug, t.slug);
            const score = scoreFor(t, norm);
            return (
              <li key={t.id} style={{ fontSize: 14 }}>
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <span>
                    {href ? <Link href={href}>{t.title}</Link> : t.title}{" "}
                    <span className="faint">· {t.hostName ?? hostLabel}</span>
                  </span>
                  <span className="mono" style={{ textAlign: "right" }}>
                    {norm === "raw" ? score : score.toFixed(2)}
                    {t.lastHeartAt ? (
                      <span
                        className="faint"
                        style={{ display: "block", fontSize: 11 }}
                      >
                        last <Heart size={14} fill="currentColor" aria-hidden />{" "}
                        {new Date(t.lastHeartAt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </span>
                </div>
                <BreakdownToggle
                  slug={slug}
                  topicId={t.id}
                  className="dash-breakdown"
                  triggerClassName="thread-toggle"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
