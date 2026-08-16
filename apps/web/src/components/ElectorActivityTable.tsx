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
import { useTableSort } from "@/lib/useTableSort";

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

function compareTopics(a: HeartedTopic, b: HeartedTopic, key: TopicSortKey) {
  switch (key) {
    case "name":
      return a.title.localeCompare(b.title);
    case "host":
      return (a.hostName ?? "").localeCompare(b.hostName ?? "");
    case "comments":
      return a.commentCount - b.commentCount;
  }
}

function compareElectors(a: ElectorRow, b: ElectorRow, key: SortKey) {
  switch (key) {
    case "name":
      return (a.electorName ?? "").localeCompare(b.electorName ?? "");
    case "hearts":
      return a.heartCount - b.heartCount;
    case "comments":
      return a.commentCount - b.commentCount;
    case "queue":
      return a.queueCount - b.queueCount;
    case "activity":
      return (
        (a.latestActivityAt ? Date.parse(a.latestActivityAt) : 0) -
        (b.latestActivityAt ? Date.parse(b.latestActivityAt) : 0)
      );
  }
}

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
  const { sortRows, headerProps } = useTableSort<TopicSortKey, HeartedTopic>({
    initial: "name",
    ascendingKeys: ["name", "host"],
    compare: compareTopics,
  });
  const sorted = sortRows(topics);

  return (
    <table className="data-table sortable-table">
      <thead>
        <tr>
          <SortHeader label="Topic" {...headerProps("name")} />
          <SortHeader label={hostLabel} {...headerProps("host")} />
          <SortHeader label="Comments" {...headerProps("comments")} />
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
              <span className="hint">No ❤️s yet.</span>
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
  const { sortRows, headerProps } = useTableSort<SortKey, ElectorRow>({
    initial: "activity",
    ascendingKeys: ["name"],
    compare: compareElectors,
  });
  const sorted = sortRows(rows);

  return (
    <div className="table-wrap">
      <table className="data-table sortable-table">
        <thead>
          <tr>
            <SortHeader label={electorLabel} {...headerProps("name")} />
            <SortHeader label="❤️" {...headerProps("hearts")} />
            <SortHeader label="Comments" {...headerProps("comments")} />
            <SortHeader label="Queue" {...headerProps("queue")} />
            <SortHeader label="Last activity" {...headerProps("activity")} />
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
