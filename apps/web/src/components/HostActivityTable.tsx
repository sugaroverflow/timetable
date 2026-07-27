"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { SortHeader } from "@/components/SortHeader";
import { relativeTime } from "@/lib/relativeTime";

export type HostActivityRow = {
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  hostSlug: string | null;
  topicCount: number;
  commentCount: number;
  latestActivityAt: string | null;
};

type SortKey = "name" | "topics" | "comments" | "activity";

/**
 * Host-activity table (QA 2026-07-27 — replaced the weighted-votes host
 * leaderboard): every host with their published-topic count, comments
 * written, and last activity. Names link to person pages; click-to-sort
 * headers, client-side like the elector table's.
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
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = (a.hostName ?? "").localeCompare(b.hostName ?? "");
        break;
      case "topics":
        cmp = a.topicCount - b.topicCount;
        break;
      case "comments":
        cmp = a.commentCount - b.commentCount;
        break;
      case "activity":
        cmp =
          (a.latestActivityAt ? Date.parse(a.latestActivityAt) : 0) -
          (b.latestActivityAt ? Date.parse(b.latestActivityAt) : 0);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="table-wrap">
      <table className="data-table sortable-table">
        <thead>
          <tr>
            <SortHeader
              label={hostLabel}
              active={sortKey === "name"}
              dir={dir}
              onToggle={() => toggleSort("name")}
            />
            <SortHeader
              label="Topics"
              active={sortKey === "topics"}
              dir={dir}
              onToggle={() => toggleSort("topics")}
            />
            <SortHeader
              label="Comments"
              active={sortKey === "comments"}
              dir={dir}
              onToggle={() => toggleSort("comments")}
            />
            <SortHeader
              label="Last activity"
              active={sortKey === "activity"}
              dir={dir}
              onToggle={() => toggleSort("activity")}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((host) => (
            <tr key={host.hostId}>
              <td>
                <span className="row" style={{ gap: 8, alignItems: "center" }}>
                  <Avatar small name={host.hostName} image={host.hostImage} />
                  <Link href={`/f/${slug}/${host.hostSlug ?? host.hostId}`}>
                    <strong>{host.hostName ?? "Host"}</strong>
                  </Link>
                </span>
              </td>
              <td className="mono">{host.topicCount}</td>
              <td className="mono">{host.commentCount}</td>
              <td>
                {host.latestActivityAt ? (
                  // suppressHydrationWarning: server and client may render
                  // this a minute apart; hover carries the exact timestamp.
                  <span
                    title={new Date(host.latestActivityAt).toLocaleString()}
                    suppressHydrationWarning
                  >
                    {relativeTime(host.latestActivityAt)}
                  </span>
                ) : (
                  <span className="faint">None</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
