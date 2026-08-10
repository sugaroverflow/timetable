"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import {
  BreakdownCaret,
  BreakdownPanelBody,
  HostHeartBreakdownPanelBody,
} from "@/components/BreakdownPanel";
import { SelectMinimal } from "@/components/SelectMinimal";
import {
  COMMENT_NORM_MODES,
  HOST_HEART_NORM_MODES,
  NORM_MODES,
  type CommentNormKey,
  type HostHeartNormKey,
  type NormKey,
} from "@/lib/normModes";
import { personPath } from "@/lib/personPath";
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
  /** 💙 metrics — the API sends null to non-admin viewers (host hearts,
   * 2026-08-04); the 💙 sort options only render for admins. */
  hostHeartCount: number | null;
  hostHeartL2: number | null;
  hostHeartL1: number | null;
  hostHeartDevotion: number | null;
};

type AnyNormKey = NormKey | CommentNormKey | HostHeartNormKey;

// eslint-disable-next-line complexity -- one case per norm key; a lookup map would obscure the entry-field pairing
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
    case "hh_raw":
      return entry.hostHeartCount ?? 0;
    case "hh_l2":
      return entry.hostHeartL2 ?? 0;
    case "hh_l1":
      return entry.hostHeartL1 ?? 0;
    case "hh_devotion":
      return entry.hostHeartDevotion ?? 0;
    default:
      return entry.weightedScore; // l1
  }
}

/** Norms that are whole counts — rendered without decimals. */
const INTEGER_NORMS: readonly AnyNormKey[] = [
  "raw",
  "c_raw",
  "c_commenters",
  "hh_raw",
];

/** One topics-analysis row: "▸ [host avatar] host: topic … score". The
 * host links to their person page, the disclosure triangle opens the
 * ❤️ breakdown (QA 2026-07-27 — the "last ❤️" date came off the row). */
function LeaderboardRow({
  entry,
  norm,
  slug,
  hostLabel,
  electorLabel,
}: {
  entry: LeaderboardEntry;
  norm: AnyNormKey;
  slug: string;
  electorLabel: string;
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
          {/* The avatar clicks through like the name (links pass 2026-08-03). */}
          <Link
            className="person-trigger"
            href={personPath(slug, entry.hostSlug ?? entry.hostId)}
          >
            <Avatar small name={entry.hostName} image={entry.hostImage} />
          </Link>
          <span>
            <Link href={personPath(slug, entry.hostSlug ?? entry.hostId)}>
              {entry.hostName ?? hostLabel}:
            </Link>{" "}
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
          {/* Under a 💙 sort the dropdown shows hosts, not electors —
              admin eyes only (host hearts, 2026-08-04). */}
          {norm.startsWith("hh_") ? (
            <HostHeartBreakdownPanelBody
              slug={slug}
              topicId={entry.id}
              hostLabel={hostLabel}
            />
          ) : (
            <BreakdownPanelBody
              slug={slug}
              topicId={entry.id}
              electorLabel={electorLabel}
            />
          )}
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
  showHostHearts = false,
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
  /** Admin viewers get the 💙 sort options (host hearts, 2026-08-04). */
  showHostHearts?: boolean;
}) {
  const [norm, setNorm] = useState<AnyNormKey>("l1");
  const mode =
    [...NORM_MODES, ...COMMENT_NORM_MODES, ...HOST_HEART_NORM_MODES].find(
      (m) => m.key === norm,
    ) ?? NORM_MODES[0]!;
  const sorted = [...entries].sort(
    (a, b) => scoreFor(b, norm) - scoreFor(a, norm),
  );
  // The former stat cards, folded into a SUBTITLE under a plain "Topics"
  // title (QA 2026-07-29; the sentence was the title itself before):
  // "12 topics from 20 hosts sorted by 87 ❤️ from 9 electors". hostCount
  // is ALL the forum's hosts, topic-less ones included (per Ed). Under a
  // 💬 norm the sorted-by clause switches to the comment total.
  const count = (n: number, label: string) =>
    `${n} ${(n === 1 ? label : pluralLabel(label)).toLowerCase()}`;
  const sortedBy = norm.startsWith("c_")
    ? `${entries.reduce((sum, e) => sum + e.commentTotal, 0)} 💬`
    : norm.startsWith("hh_")
      ? `${entries.reduce((sum, e) => sum + (e.hostHeartCount ?? 0), 0)} 💙`
      : `${totalHearts} ❤️`;
  const sortedFrom = norm.startsWith("hh_")
    ? count(hostCount, hostLabel)
    : count(electorCount, electorLabel);
  const subtitle = `${entries.length} topic${entries.length === 1 ? "" : "s"} from ${count(hostCount, hostLabel)} sorted by ${sortedBy} from ${sortedFrom}`;

  return (
    <div className="card">
      <CollapsibleSection title="Topics">
        <div
          className="row wrap"
          style={{
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          {/* Normal body type, not small print (QA 2026-08-10) — the
              sentence IS the table's summary statistics. */}
          <p style={{ margin: "2px 0 0" }}>{subtitle}</p>
          <span className="row wrap" style={{ gap: 10, alignItems: "center" }}>
            {hostFilter}
            <SelectMinimal
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
              {showHostHearts ? (
                <optgroup label={`💙 ${hostLabel.toLowerCase()} hearts`}>
                  {HOST_HEART_NORM_MODES.map((m) => (
                    <option key={m.key} value={m.key} title={m.description}>
                      {m.symbol} — {m.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </SelectMinimal>
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
                electorLabel={electorLabel}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
