import Link from "next/link";

import { isAdmin, isHost, type Role } from "@timetable/shared";

import { DashboardActivityFilter } from "@/components/DashboardActivityFilter";
import { DashboardSinceFilter } from "@/components/DashboardSinceFilter";
import { ElectorActivityTable } from "@/components/ElectorActivityTable";
import { HostFilter } from "@/components/HostFilter";
import { TopicLeaderboard } from "@/components/TopicLeaderboard";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  pluralLabel,
  roleLabel,
} from "@/lib/timetableSettings";

const ACTIVITY_FILTERS = new Set([
  "all",
  "active",
  "quiet",
  "no_hearts",
  "no_comments",
]);

type Dashboard = {
  totalHearts: number;
  electorCount: number;
  hostCount: number;
  topicLeaderboard: {
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
  }[];
  hostLeaderboard: {
    hostId: string;
    hostName: string | null;
    weightedScore: number;
  }[];
  electorActivity: {
    electorId: string;
    electorName: string | null;
    heartCount: number;
    commentCount: number;
    latestActivityAt: string | null;
    heartedTopics: {
      topicId: string;
      title: string;
      slug: string | null;
      hostId: string;
      hostName: string | null;
      hostSlug: string | null;
    }[];
  }[];
};

type Data = {
  timetable: {
    viewerRoles: string[];
    settings: string;
    heartsCountFrom: string | null;
  } | null;
  timetableHosts: { id: string; name: string | null }[];
  dashboard: Dashboard | null;
};

const QUERY = `
  query Dashboard($s: String!, $host: String, $activity: String, $since: String) {
    timetable(idOrSlug: $s) { viewerRoles settings heartsCountFrom }
    timetableHosts(idOrSlug: $s) { id name }
    dashboard(idOrSlug: $s, hostId: $host, electorActivity: $activity, activitySince: $since) {
      totalHearts electorCount hostCount
      topicLeaderboard { id title slug hostId hostName hostImage hostSlug weightedScore l2Score devotionScore heartCount }
      hostLeaderboard { hostId hostName weightedScore }
      electorActivity {
        electorId electorName heartCount commentCount
        latestActivityAt
        heartedTopics { topicId title slug hostId hostName hostSlug }
      }
    }
  }
`;

/** Unknown filter values fall back to safe defaults rather than erroring. */
function normalizeFilters(sp: {
  host?: string;
  activity?: string;
  since?: string;
}) {
  const host = sp.host ?? "";
  const activity =
    sp.activity && ACTIVITY_FILTERS.has(sp.activity) ? sp.activity : "all";
  const since = sp.since && !Number.isNaN(Date.parse(sp.since)) ? sp.since : "";
  return { host, activity, since };
}

/** Picker shows the explicit choice, or the hearts-cutoff default. */
function sincePickerValue(since: string, timetable: Data["timetable"]): string {
  return (
    since ||
    (timetable?.heartsCountFrom ? timetable.heartsCountFrom.slice(0, 10) : "")
  );
}

function HostLeaderboardCard({
  slug,
  hostsPlural,
  entries,
}: {
  slug: string;
  hostsPlural: string;
  entries: Dashboard["hostLeaderboard"];
}) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>
        All {hostsPlural} by weighted votes
      </h3>
      {entries.length === 0 ? (
        <p className="faint" style={{ fontSize: 13 }}>
          No data yet.
        </p>
      ) : (
        <ul className="list">
          {entries.map((h) => (
            <li
              key={h.hostId}
              className="row"
              style={{ justifyContent: "space-between", fontSize: 14 }}
            >
              <span>
                <Link href={`/f/${slug}/topics?host=${h.hostId}`}>
                  {h.hostName ?? "Host"}
                </Link>
              </span>
              <span className="mono">{h.weightedScore.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ host?: string; activity?: string; since?: string }>;
}) {
  const { slug } = await params;
  const { host, activity, since } = normalizeFilters(await searchParams);
  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    host: host || null,
    activity,
    since: since || null,
  });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );

  if (!isHost(roles) && !isAdmin(roles)) {
    return <div className="notice">Hosts and admins only.</div>;
  }
  const d = data.dashboard;
  if (!d) return <div className="notice">No dashboard data.</div>;
  const settings = parseTimetableSettings(data.timetable?.settings);
  const hostLabel = roleLabel(settings.roleLabels, "host");
  const hostsPlural = pluralLabel(hostLabel);
  const electorLabel = roleLabel(settings.roleLabels, "elector");
  const viewerIsAdmin = isAdmin(roles);
  const sinceValue = sincePickerValue(since, data.timetable);

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Analysis</h2>
      </div>

      <div className="toolbar feed-toolbar">
        <HostFilter
          value={host}
          hosts={data.timetableHosts}
          allLabel={`All ${hostsPlural}`}
        />
      </div>

      <div className="grid grid-2">
        <TopicLeaderboard
          slug={slug}
          hostLabel={hostLabel}
          entries={d.topicLeaderboard}
          totalHearts={d.totalHearts}
          hostCount={d.hostCount}
          electorCount={d.electorCount}
          electorLabel={electorLabel}
        />

        {viewerIsAdmin ? (
          <HostLeaderboardCard
            slug={slug}
            hostsPlural={hostsPlural}
            entries={d.hostLeaderboard}
          />
        ) : null}
      </div>

      <div className="card">
        <div
          className="row wrap"
          style={{ justifyContent: "space-between", marginBottom: 12 }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>{electorLabel} activity</h3>
          {/* These two only filter THIS table: which electors show, and the
              date activity is counted from (default: the hearts cutoff). */}
          <span className="row wrap" style={{ gap: 10, alignItems: "center" }}>
            <DashboardActivityFilter
              value={activity}
              allLabel={`All ${pluralLabel(electorLabel).toLowerCase()}`}
            />
            <DashboardSinceFilter value={sinceValue} />
            <span className="faint" style={{ fontSize: 12 }}>
              {d.electorActivity.length} shown
            </span>
          </span>
        </div>
        {d.electorActivity.length === 0 ? (
          <p className="faint" style={{ fontSize: 13 }}>
            No electors match this filter.
          </p>
        ) : (
          <ElectorActivityTable
            slug={slug}
            electorLabel={electorLabel}
            rows={d.electorActivity}
          />
        )}
      </div>
    </div>
  );
}
