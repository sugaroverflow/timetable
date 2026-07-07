import Link from "next/link";

import { isAdmin, isHost, type Role } from "@timetable/shared";

import { DashboardActivityFilter } from "@/components/DashboardActivityFilter";
import { HostFilter } from "@/components/HostFilter";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
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
  unallocatedTopics: {
    id: string;
    title: string;
    slug: string | null;
    hostSlug: string | null;
  }[];
  conflicts: {
    slotId: string;
    location: string;
    startsAt: string;
    topics: { id: string; title: string }[];
  }[];
};

type Data = {
  timetable: { viewerRoles: string[] } | null;
  timetableHosts: { id: string; name: string | null }[];
  dashboard: Dashboard | null;
};

const QUERY = `
  query Dashboard($s: String!, $host: String, $activity: String) {
    timetable(idOrSlug: $s) { viewerRoles }
    timetableHosts(idOrSlug: $s) { id name }
    dashboard(idOrSlug: $s, hostId: $host, electorActivity: $activity) {
      totalHearts electorCount hostCount slotCount
      topicCounts { draft submitted published unpublished archived }
      topicLeaderboard { id title slug hostName hostSlug weightedScore heartCount }
      hostLeaderboard { hostId hostName weightedScore }
      electorActivity {
        electorId electorName heartCount commentCount availabilityCount
        latestActivityAt
      }
      unallocatedTopics { id title slug hostSlug }
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
  searchParams: Promise<{ host?: string; activity?: string }>;
}) {
  const { slug } = await params;
  const { host: hostParam, activity: activityParam } = await searchParams;
  const host = hostParam ?? "";
  const activity =
    activityParam && ACTIVITY_FILTERS.has(activityParam) ? activityParam : "all";
  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    host: host || null,
    activity,
  });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );

  if (!isHost(roles) && !isAdmin(roles)) {
    return <div className="notice">Hosts and admins only.</div>;
  }
  const d = data.dashboard;
  if (!d) return <div className="notice">No dashboard data.</div>;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Dashboard</h2>
        <p>Activity and standings across this timetable.</p>
      </div>

      <div className="toolbar">
        <label>Host</label>
        <HostFilter value={host} hosts={data.timetableHosts} />
        <label>Elector activity</label>
        <DashboardActivityFilter value={activity} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
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
                <li
                  key={t.id}
                  className="row"
                  style={{ justifyContent: "space-between", fontSize: 14 }}
                >
                  <span>
                    {(() => {
                      const href = topicPath(slug, t.hostSlug, t.slug);
                      return href ? <Link href={href}>{t.title}</Link> : t.title;
                    })()}{" "}
                    <span className="faint">· {t.hostName ?? "Host"}</span>
                  </span>
                  <span className="mono">{t.weightedScore.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>All hosts by weighted votes</h3>
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
      </div>

      <div className="card">
        <div
          className="row wrap"
          style={{ justifyContent: "space-between", marginBottom: 12 }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>Elector activity</h3>
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
                  <th>Elector</th>
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

      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>
          Unallocated published topics ({d.unallocatedTopics.length})
        </h3>
        {d.unallocatedTopics.length === 0 ? (
          <p className="faint" style={{ fontSize: 13 }}>
            Every published topic is tagged to a slot.
          </p>
        ) : (
          <ul className="list">
            {d.unallocatedTopics.map((t) => (
              <li key={t.id} style={{ fontSize: 14 }}>
                {(() => {
                  const href = topicPath(slug, t.hostSlug, t.slug);
                  return href ? <Link href={href}>{t.title}</Link> : t.title;
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
