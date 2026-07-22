"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

import { topicPath } from "@/lib/topicPath";

type HeartedTopic = {
  topicId: string;
  title: string;
  slug: string | null;
  hostId: string;
  hostName: string | null;
  hostSlug: string | null;
};

export type ElectorRow = {
  electorId: string;
  electorName: string | null;
  heartCount: number;
  commentCount: number;
  availabilityCount: number;
  latestActivityAt: string | null;
  heartedTopics: HeartedTopic[];
};

type SortKey = "name" | "hearts" | "comments" | "availability" | "activity";

function groupByHost(topics: HeartedTopic[]) {
  const map = new Map<
    string,
    { hostName: string | null; hostSlug: string | null; topics: HeartedTopic[] }
  >();
  for (const t of topics) {
    const group = map.get(t.hostId) ?? {
      hostName: t.hostName,
      hostSlug: t.hostSlug,
      topics: [],
    };
    group.topics.push(t);
    map.set(t.hostId, group);
  }
  return Array.from(map.values());
}

/** The expanded row under an elector when "Show ❤️s" is on: the topics they
 * hearted, grouped by host. */
function HeartsRow({ slug, topics }: { slug: string; topics: HeartedTopic[] }) {
  return (
    <tr className="elector-hearts-row">
      <td colSpan={5}>
        {topics.length === 0 ? (
          <span className="faint" style={{ fontSize: 12 }}>
            No hearts in range.
          </span>
        ) : (
          <div className="elector-hearts">
            {groupByHost(topics).map((group) => (
              <div
                key={group.hostSlug ?? group.hostName ?? "host"}
                className="elector-hearts-group"
              >
                <div className="faint" style={{ fontSize: 12 }}>
                  {group.hostName ?? "Host"}
                </div>
                <ul>
                  {group.topics.map((t) => {
                    const href = topicPath(slug, t.hostSlug, t.slug);
                    return (
                      <li key={t.topicId}>
                        {href ? <Link href={href}>{t.title}</Link> : t.title}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * Elector-activity table with click-to-sort headers and a "Show ❤️s" toggle
 * that expands each row into the topics they hearted, grouped by host
 * (product feedback round 1). Sorting/toggling are client-side over the rows
 * the server already returned (respecting the page's host/since filters).
 */
export function ElectorActivityTable({
  slug,
  electorLabel,
  rows,
}: {
  slug: string;
  electorLabel: string;
  rows: ElectorRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showHearts, setShowHearts] = useState(false);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text sorts read best ascending; counts/dates descending.
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = (a.electorName ?? "").localeCompare(b.electorName ?? "");
        break;
      case "hearts":
        cmp = a.heartCount - b.heartCount;
        break;
      case "comments":
        cmp = a.commentCount - b.commentCount;
        break;
      case "availability":
        cmp = a.availabilityCount - b.availabilityCount;
        break;
      case "activity":
        cmp =
          (a.latestActivityAt ? Date.parse(a.latestActivityAt) : 0) -
          (b.latestActivityAt ? Date.parse(b.latestActivityAt) : 0);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  function header(key: SortKey, label: string) {
    const active = sortKey === key;
    return (
      <th
        aria-sort={
          active ? (dir === "asc" ? "ascending" : "descending") : "none"
        }
      >
        <button
          type="button"
          className={active ? "th-sort th-sort-active" : "th-sort"}
          onClick={() => toggleSort(key)}
        >
          {label}
          <span aria-hidden className="th-sort-arrow">
            {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
          </span>
        </button>
      </th>
    );
  }

  return (
    <div className="table-wrap">
      <div
        className="row"
        style={{ justifyContent: "flex-end", marginBottom: 8 }}
      >
        <label
          className="row"
          style={{ gap: 6, alignItems: "center", fontSize: 13 }}
        >
          <input
            type="checkbox"
            checked={showHearts}
            onChange={(e) => setShowHearts(e.target.checked)}
          />
          Show ❤️s
        </label>
      </div>
      <table className="data-table sortable-table">
        <thead>
          <tr>
            {header("name", electorLabel)}
            {header("hearts", "Hearts")}
            {header("comments", "Comments")}
            {header("availability", "Availability")}
            {header("activity", "Last activity")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((elector) => (
            <Fragment key={elector.electorId}>
              <tr>
                <td>
                  <strong>{elector.electorName ?? "Elector"}</strong>
                </td>
                <td className="mono">{elector.heartCount}</td>
                <td className="mono">{elector.commentCount}</td>
                <td className="mono">{elector.availabilityCount}</td>
                <td>
                  {elector.latestActivityAt ? (
                    new Date(elector.latestActivityAt).toLocaleString()
                  ) : (
                    <span className="faint">None</span>
                  )}
                </td>
              </tr>
              {showHearts ? (
                <HeartsRow slug={slug} topics={elector.heartedTopics} />
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
