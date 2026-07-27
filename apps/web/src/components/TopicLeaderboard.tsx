"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import {
  BreakdownCaret,
  BreakdownPanelBody,
} from "@/components/BreakdownPanel";
import { NORM_MODES, type NormKey } from "@/lib/normModes";
import { pluralLabel } from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

export type LeaderboardEntry = {
  id: string;
  title: string;
  slug: string | null;
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  hostSlug: string | null;
  weightedScore: number;
  l2Score: number;
  devotionScore: number;
  heartCount: number;
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

/** One topics-analysis row: "▸ [host avatar] host: topic … score". The
 * host links to their person page, the disclosure triangle opens the
 * ❤️ breakdown (QA 2026-07-27 — the "last ❤️" date came off the row). */
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
        <span className="row" style={{ gap: 6, alignItems: "center" }}>
          <BreakdownCaret open={open} onToggle={() => setOpen(!open)} />
          <Avatar small name={entry.hostName} image={entry.hostImage} />
          <span>
            <Link href={`/f/${slug}/${entry.hostSlug ?? entry.hostId}`}>
              {entry.hostName ?? hostLabel}
            </Link>
            {": "}
            {href ? <Link href={href}>{entry.title}</Link> : entry.title}
          </span>
        </span>
        <span className="mono">
          {norm === "raw" ? score : score.toFixed(2)}
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
 * The "topics analysis table": every published topic with a normalisation
 * switcher (product feedback round 1). The API sends every norm per topic;
 * switching re-sorts and re-labels client-side without a round-trip.
 */
export function TopicLeaderboard({
  slug,
  hostLabel,
  entries,
  totalHearts,
  hostCount,
  electorCount,
  electorLabel,
}: {
  slug: string;
  hostLabel: string;
  entries: LeaderboardEntry[];
  totalHearts: number;
  hostCount: number;
  electorCount: number;
  electorLabel: string;
}) {
  const [norm, setNorm] = useState<NormKey>("l1");
  const mode = NORM_MODES.find((m) => m.key === norm) ?? NORM_MODES[0]!;
  const sorted = [...entries].sort(
    (a, b) => scoreFor(b, norm) - scoreFor(a, norm),
  );
  // The former stat cards, folded into the title (QA 2026-07-27):
  // "12 topics from 20 hosts sorted by 87 ❤️ from 9 electors". hostCount
  // is ALL the forum's hosts, topic-less ones included (per Ed).
  const count = (n: number, label: string) =>
    `${n} ${(n === 1 ? label : pluralLabel(label)).toLowerCase()}`;
  const title = `${entries.length} topic${entries.length === 1 ? "" : "s"} from ${count(hostCount, hostLabel)} sorted by ${totalHearts} ❤️ from ${count(electorCount, electorLabel)}`;

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
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
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
