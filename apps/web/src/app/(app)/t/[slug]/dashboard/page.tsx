import Link from "next/link";

import { isAdmin, isHost, type Role } from "@timetable/shared";

import { DashboardActivityFilter } from "@/components/DashboardActivityFilter";
import { DashboardBreakdownToggle } from "@/components/DashboardBreakdownToggle";
import { DashboardSinceFilter } from "@/components/DashboardSinceFilter";
import { HostFilter } from "@/components/HostFilter";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  pluralLabel,
  roleLabel,
} from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

const ACTIVITY_FILTERS = new Set([
  "all",
  "active",
  "quiet",
  "no_hearts",
  "no_comments",
  "no_availability",
]);

type Dashboard = {
  totalHearts: number;
  electorCount: number;
  hostCount: number;
  slotCount: number;
  topicCounts: {
    draft: number;
    submitted: number;
    published: number;
    unpublished: number;
    archived: number;
  };
  topicLeaderboard: {
    id: string;
    title: string;
    slug: string | null;
    hostName: string | null;
    hostSlug: string | null;
    weightedScore: number;
    heartCount: number;
    lastHeartAt: string | null;
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
    availabilityCount: number;
    latestActivityAt: string | null;
  }[];
  conflicts: {
    slotId: string;
    location: string;
    startsAt: string;
    topics: { id: string; title: string }[];
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
      totalHearts electorCount hostCount slotCount
      topicCounts { draft submitted published unpublished archived }
      topicLeaderboard { id title slug hostName hostSlug weightedScore heartCount lastHeartAt }
      hostLeaderboard { hostId hostName weightedScore }
      electorActivity {
        electorId electorName heartCount commentCount availabilityCount
        latestActivityAt
      }
      conflicts { slotId location startsAt topics { id title } }
    }
  }
`;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: 28 }}>{value}</div>
      <div className="faint" style={{ fontSize: 12 }}>
        {label}
      </div>
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
  const {
    host: hostParam,
    activity: activityParam,
    since: sinceParam,
  } = await searchParams;
  const host = hostParam ?? "";
  const activity =
    activityParam && ACTIVITY_FILTERS.has(activityParam) ? activityParam : "all";
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? sinceParam : "";
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
  // Picker shows the explicit choice, or the hearts-cutoff default.
  const sinceValue =
    since ||
    (data.timetable?.heartsCountFrom
      ? data.timetable.heartsCountFrom.slice(0, 10)
      : "");

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Dashboard</h2>
        <p>Activity and standings across this timetable.</p>
      </div>

      <div className="toolbar">
        <label>{hostLabel}</label>
        <HostFilter
          value={host}
          hosts={data.timetableHosts}
          allLabel={`All ${hostsPlural}`}
        />
        <label>{electorLabel} activity</label>
        <DashboardActivityFilter value={activity} />
        <DashboardSinceFilter value={sinceValue} />
      </div>

      <div className="stat-grid">
        <Stat label="Published topics" value={d.topicCounts.published} />
        <Stat label="Total hearts" value={d.totalHearts} />
        <Stat label="Electors" value={d.electorCount} />
        <Stat label="Timeslots" value={d.slotCount} />
      </div>

      {d.conflicts.length > 0 ? (
        <div className="card" style={{ borderColor: "var(--yellow)" }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>
            ⚠ Slot conflicts ({d.conflicts.length})
          </h3>
          <ul className="list">
            {d.conflicts.map((c) => (
              <li key={c.slotId} className="faint" style={{ fontSize: 13 }}>
                {new Date(c.startsAt).toLocaleString()} · {c.location || "—"} —{" "}
                {c.topics.map((t) => t.title).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>All topics by weighted votes</h3>
          {d.topicLeaderboard.length === 0 ? (
            <p className="faint" style={{ fontSize: 13 }}>
              No published topics yet.
            </p>
          ) : (
            <ul className="list">
              {d.topicLeaderboard.map((t) => (
                <li key={t.id} style={{ fontSize: 14 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {(() => {
                        const href = topicPath(slug, t.hostSlug, t.slug);
                        return href ? <Link href={href}>{t.title}</Link> : t.title;
                      })()}{" "}
                      <span className="faint">· {t.hostName ?? hostLabel}</span>
                    </span>
                    <span className="mono" style={{ textAlign: "right" }}>
                      {t.weightedScore.toFixed(2)}
                      {t.lastHeartAt ? (
                        <span className="faint" style={{ display: "block", fontSize: 11 }}>
                          last ♥ {new Date(t.lastHeartAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <DashboardBreakdownToggle slug={slug} topicId={t.id} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {viewerIsAdmin ? (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>
            All {hostsPlural} by weighted votes
          </h3>
          {d.hostLeaderboard.length === 0 ? (
            <p className="faint" style={{ fontSize: 13 }}>
              No data yet.
            </p>
          ) : (
            <ul className="list">
              {d.hostLeaderboard.map((h) => (
                <li
                  key={h.hostId}
                  className="row"
                  style={{ justifyContent: "space-between", fontSize: 14 }}
                >
                  <span>
                    <Link href={`/t/${slug}/feed?host=${h.hostId}`}>
                      {h.hostName ?? "Host"}
                    </Link>
                  </span>
                  <span className="mono">{h.weightedScore.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        ) : null}
      </div>

      <div className="card">
        <div
          className="row wrap"
          style={{ justifyContent: "space-between", marginBottom: 12 }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>{electorLabel} activity</h3>
          <span className="faint" style={{ fontSize: 12 }}>
            {d.electorActivity.length} shown
          </span>
        </div>
        {d.electorActivity.length === 0 ? (
          <p className="faint" style={{ fontSize: 13 }}>
            No electors match this filter.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{electorLabel}</th>
                  <th>Hearts</th>
                  <th>Comments</th>
                  <th>Availability</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {d.electorActivity.map((elector) => (
                  <tr key={elector.electorId}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
