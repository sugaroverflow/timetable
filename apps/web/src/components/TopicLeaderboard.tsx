"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import {
  BreakdownCaret,
  BreakdownPanelBody,
} from "@/components/BreakdownPanel";
import {
  COMMENT_NORM_MODES,
  NORM_MODES,
  type CommentNormKey,
  type NormKey,
} from "@/lib/normModes";
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
  commentTotal: number;
  commenterCount: number;
  commentL2: number;
  commentL1: number;
  commentDevotion: number;
};

type AnyNormKey = NormKey | CommentNormKey;

function scoreFor(entry: LeaderboardEntry, key: AnyNormKey): number {
  switch (key) {
    case "raw":
      return entry.heartCount;
    case "l2":
      return entry.l2Score;
    case "devotion":
      return entry.devotionScore;
    case "c_raw":
      return entry.commentTotal;
    case "c_commenters":
      return entry.commenterCount;
    case "c_l2":
      return entry.commentL2;
    case "c_l1":
      return entry.commentL1;
    case "c_devotion":
      return entry.commentDevotion;
    default:
      return entry.weightedScore; // l1
  }
}

/** Norms that are whole counts — rendered without decimals. */
const INTEGER_NORMS: readonly AnyNormKey[] = ["raw", "c_raw", "c_commenters"];

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
  norm: AnyNormKey;
  slug: string;
  hostLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const href = topicPath(slug, entry.hostSlug, entry.slug, entry.hostId);
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
            <strong>
              {href ? <Link href={href}>{entry.title}</Link> : entry.title}
            </strong>
          </span>
        </span>
        <span className="mono">
          {INTEGER_NORMS.includes(norm) ? score : score.toFixed(2)}
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
  hostFilter,
}: {
  slug: string;
  hostLabel: string;
  entries: LeaderboardEntry[];
  totalHearts: number;
  hostCount: number;
  electorCount: number;
  electorLabel: string;
  /** This table's own host filter (per-table filters, QA 2026-07-27),
   * rendered with the other header controls. */
  hostFilter?: React.ReactNode;
}) {
  const [norm, setNorm] = useState<AnyNormKey>("l1");
  const mode =
    [...NORM_MODES, ...COMMENT_NORM_MODES].find((m) => m.key === norm) ??
    NORM_MODES[0]!;
  const sorted = [...entries].sort(
    (a, b) => scoreFor(b, norm) - scoreFor(a, norm),
  );
  // The former stat cards, folded into the title (QA 2026-07-27):
  // "12 topics from 20 hosts sorted by 87 ❤️ from 9 electors". hostCount
  // is ALL the forum's hosts, topic-less ones included (per Ed). Under a
  // 💬 norm the sorted-by clause switches to the comment total.
  const count = (n: number, label: string) =>
    `${n} ${(n === 1 ? label : pluralLabel(label)).toLowerCase()}`;
  const sortedBy = norm.startsWith("c_")
    ? `${entries.reduce((sum, e) => sum + e.commentTotal, 0)} 💬`
    : `${totalHearts} ❤️`;
  const title = `${entries.length} topic${entries.length === 1 ? "" : "s"} from ${count(hostCount, hostLabel)} sorted by ${sortedBy} from ${count(electorCount, electorLabel)}`;

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
        <span className="row wrap" style={{ gap: 10, alignItems: "center" }}>
          {hostFilter}
          <select
            aria-label="Score normalisation"
            value={norm}
            onChange={(e) => setNorm(e.target.value as AnyNormKey)}
          >
            <optgroup label="❤️ hearts">
              {NORM_MODES.map((m) => (
                <option key={m.key} value={m.key} title={m.description}>
                  {m.symbol} — {m.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="💬 comments">
              {COMMENT_NORM_MODES.map((m) => (
                <option key={m.key} value={m.key} title={m.description}>
                  {m.symbol} — {m.label}
                </option>
              ))}
            </optgroup>
          </select>
        </span>
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
