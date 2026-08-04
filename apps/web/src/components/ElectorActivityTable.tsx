"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { BreakdownCaret } from "@/components/BreakdownPanel";
import { SortHeader } from "@/components/SortHeader";
import { formatExactTime } from "@/lib/dates";
import { personPath } from "@/lib/personPath";
import { relativeTime } from "@/lib/relativeTime";
import { topicPath } from "@/lib/topicPath";

export type HeartedTopic = {
  topicId: string;
  title: string;
  slug: string | null;
  hostId: string;
  hostName: string | null;
  hostSlug: string | null;
  commentCount: number;
};

export type ElectorRow = {
  electorId: string;
  electorName: string | null;
  electorImage: string | null;
  heartCount: number;
  commentCount: number;
  /** Published topics this elector has never seen nor ❤️'d. */
  queueCount: number;
  latestActivityAt: string | null;
  heartedTopics: HeartedTopic[];
};

type SortKey = "name" | "hearts" | "comments" | "queue" | "activity";
type TopicSortKey = "name" | "host" | "comments";

/** The fold under an elector row: the topics they ❤️'d as a sortable table
 * (QA 2026-07-27 — replaced the page-wide "Show ❤️s" toggle and its
 * host-grouped lists). "Comments" is THIS elector's comments per topic.
 * Exported for the host-activity rows' 💙 fold (host hearts, 2026-08-04),
 * which shares the shape. */
export function HeartedTopicsTable({
  slug,
  topics,
  hostLabel,
}: {
  slug: string;
  topics: HeartedTopic[];
  hostLabel: string;
}) {
  const [key, setKey] = useState<TopicSortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  function toggle(next: TopicSortKey) {
    if (next === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setKey(next);
      setDir(next === "comments" ? "desc" : "asc");
    }
  }

  const sorted = [...topics].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.title.localeCompare(b.title);
        break;
      case "host":
        cmp = (a.hostName ?? "").localeCompare(b.hostName ?? "");
        break;
      case "comments":
        cmp = a.commentCount - b.commentCount;
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  return (
    <table className="data-table sortable-table">
      <thead>
        <tr>
          <SortHeader
            label="Topic"
            active={key === "name"}
            dir={dir}
            onToggle={() => toggle("name")}
          />
          <SortHeader
            label={hostLabel}
            active={key === "host"}
            dir={dir}
            onToggle={() => toggle("host")}
          />
          <SortHeader
            label="Comments"
            active={key === "comments"}
            dir={dir}
            onToggle={() => toggle("comments")}
          />
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => {
          const href = topicPath(slug, t.hostSlug, t.slug, t.hostId);
          return (
            <tr key={t.topicId}>
              <td>{href ? <Link href={href}>{t.title}</Link> : t.title}</td>
              <td>
                <Link href={personPath(slug, t.hostSlug ?? t.hostId)}>
                  {t.hostName ?? hostLabel}
                </Link>
              </td>
              <td className="mono">{t.commentCount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ElectorRowItem({
  slug,
  elector,
  electorLabel,
  hostLabel,
}: {
  slug: string;
  elector: ElectorRow;
  electorLabel: string;
  hostLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr>
        <td>
          <span className="row" style={{ gap: 6, alignItems: "center" }}>
            <BreakdownCaret open={open} onToggle={() => setOpen(!open)} />
            {/* Avatar + name click through to the elector's page
                (links pass 2026-08-03). */}
            <Link
              className="person-trigger"
              href={personPath(slug, elector.electorId)}
            >
              <Avatar
                small
                name={elector.electorName}
                image={elector.electorImage}
              />
              <strong>{elector.electorName ?? electorLabel}</strong>
            </Link>
          </span>
        </td>
        <td className="mono">{elector.heartCount}</td>
        <td className="mono">{elector.commentCount}</td>
        <td className="mono">{elector.queueCount}</td>
        <td>
          {elector.latestActivityAt ? (
            // suppressHydrationWarning: server and client may render this a
            // minute apart; the hover title carries the exact timestamp.
            <span
              title={formatExactTime(elector.latestActivityAt)}
              suppressHydrationWarning
            >
              {relativeTime(elector.latestActivityAt)}
            </span>
          ) : (
            <span className="faint">None</span>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="elector-hearts-row">
          <td colSpan={5}>
            {elector.heartedTopics.length === 0 ? (
              <span className="faint" style={{ fontSize: 12 }}>
                No ❤️s yet.
              </span>
            ) : (
              <HeartedTopicsTable
                slug={slug}
                topics={elector.heartedTopics}
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
 * Elector-activity table with click-to-sort headers. Each row folds open
 * (disclosure triangle, same as the ❤️-breakdown carets) into a sortable
 * table of the topics that elector ❤️'d. Sorting is client-side over the
 * rows the server already returned (respecting the page's host filter).
 */
export function ElectorActivityTable({
  slug,
  electorLabel,
  hostLabel = "Host",
  rows,
}: {
  slug: string;
  electorLabel: string;
  hostLabel?: string;
  rows: ElectorRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

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
      case "queue":
        cmp = a.queueCount - b.queueCount;
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
              label={electorLabel}
              active={sortKey === "name"}
              dir={dir}
              onToggle={() => toggleSort("name")}
            />
            <SortHeader
              label="❤️"
              active={sortKey === "hearts"}
              dir={dir}
              onToggle={() => toggleSort("hearts")}
            />
            <SortHeader
              label="Comments"
              active={sortKey === "comments"}
              dir={dir}
              onToggle={() => toggleSort("comments")}
            />
            <SortHeader
              label="Queue"
              active={sortKey === "queue"}
              dir={dir}
              onToggle={() => toggleSort("queue")}
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
          {sorted.map((elector) => (
            <ElectorRowItem
              key={elector.electorId}
              slug={slug}
              elector={elector}
              electorLabel={electorLabel}
              hostLabel={hostLabel}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
