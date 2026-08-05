"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { BreakdownCaret } from "@/components/BreakdownPanel";
import {
  HeartedTopicsTable,
  type HeartedTopic,
} from "@/components/ElectorActivityTable";
import { SortHeader } from "@/components/SortHeader";
import { formatExactTime } from "@/lib/dates";
import { personPath } from "@/lib/personPath";
import { relativeTime } from "@/lib/relativeTime";
import { useTableSort } from "@/lib/useTableSort";

export type HostActivityRow = {
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  hostSlug: string | null;
  topicCount: number;
  commentCount: number;
  /** 💙s this host has given (host hearts, 2026-08-04) — the API sends
   * null to non-admins, but this table only renders for admins. */
  hostHeartCount: number | null;
  /** The topics behind that count — the row's fold-open sub-table. */
  hostHeartedTopics: HeartedTopic[] | null;
  latestActivityAt: string | null;
};

type SortKey = "name" | "topics" | "comments" | "hostHearts" | "activity";

function compareRows(a: HostActivityRow, b: HostActivityRow, key: SortKey) {
  switch (key) {
    case "name":
      return (a.hostName ?? "").localeCompare(b.hostName ?? "");
    case "topics":
      return a.topicCount - b.topicCount;
    case "comments":
      return a.commentCount - b.commentCount;
    case "hostHearts":
      return (a.hostHeartCount ?? 0) - (b.hostHeartCount ?? 0);
    case "activity":
      return (
        (a.latestActivityAt ? Date.parse(a.latestActivityAt) : 0) -
        (b.latestActivityAt ? Date.parse(b.latestActivityAt) : 0)
      );
  }
}

/** One host row + its fold: the topics this host 💙'd, mirroring the
 * elector rows' ❤️ fold (host hearts, 2026-08-04). */
function HostRowItem({
  slug,
  host,
  hostLabel,
}: {
  slug: string;
  host: HostActivityRow;
  hostLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const heartedTopics = host.hostHeartedTopics ?? [];
  return (
    <Fragment>
      <tr>
        <td>
          <span className="row" style={{ gap: 6, alignItems: "center" }}>
            <BreakdownCaret open={open} onToggle={() => setOpen(!open)} />
            {/* One link around avatar + name — both click through
                (links pass 2026-08-03). */}
            <Link
              className="person-trigger"
              href={personPath(slug, host.hostSlug ?? host.hostId)}
            >
              <Avatar small name={host.hostName} image={host.hostImage} />
              <strong>{host.hostName ?? hostLabel}</strong>
            </Link>
          </span>
        </td>
        <td className="mono">{host.topicCount}</td>
        <td className="mono">{host.commentCount}</td>
        <td className="mono">{host.hostHeartCount ?? 0}</td>
        <td>
          {host.latestActivityAt ? (
            // suppressHydrationWarning: server and client may render
            // this a minute apart; hover carries the exact timestamp.
            <span
              title={formatExactTime(host.latestActivityAt)}
              suppressHydrationWarning
            >
              {relativeTime(host.latestActivityAt)}
            </span>
          ) : (
            <span className="faint">None</span>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="elector-hearts-row">
          <td colSpan={5}>
            {heartedTopics.length === 0 ? (
              <span className="faint" style={{ fontSize: 12 }}>
                No 💙s yet.
              </span>
            ) : (
              <HeartedTopicsTable
                slug={slug}
                topics={heartedTopics}
                hostLabel={hostLabel}
              />
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/**
 * Host-activity table (QA 2026-07-27 — replaced the weighted-votes host
 * leaderboard): every host with their published-topic count, comments
 * written, 💙s given, and last activity. Names link to person pages;
 * click-to-sort headers, client-side like the elector table's; rows fold
 * open into the host's 💙'd topics.
 */
export function HostActivityTable({
  slug,
  hostLabel,
  rows,
}: {
  slug: string;
  hostLabel: string;
  rows: HostActivityRow[];
}) {
  const { sortRows, headerProps } = useTableSort<SortKey, HostActivityRow>({
    initial: "activity",
    ascendingKeys: ["name"],
    compare: compareRows,
  });
  const sorted = sortRows(rows);

  return (
    <div className="table-wrap">
      <table className="data-table sortable-table">
        <thead>
          <tr>
            <SortHeader label={hostLabel} {...headerProps("name")} />
            <SortHeader label="Topics" {...headerProps("topics")} />
            <SortHeader label="Comments" {...headerProps("comments")} />
            <SortHeader label="💙 given" {...headerProps("hostHearts")} />
            <SortHeader label="Last activity" {...headerProps("activity")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((host) => (
            <HostRowItem
              key={host.hostId}
              slug={slug}
              host={host}
              hostLabel={hostLabel}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
