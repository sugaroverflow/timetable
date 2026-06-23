import { isAdmin, isHost, type Role } from "@timetable/shared";

import { gqlFetch } from "@/lib/graphql";

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
    hostName: string | null;
    weightedScore: number;
    heartCount: number;
  }[];
  hostLeaderboard: {
    hostId: string;
    hostName: string | null;
    weightedScore: number;
  }[];
  unallocatedTopics: { id: string; title: string }[];
  conflicts: {
    slotId: string;
    location: string;
    startsAt: string;
    topics: { id: string; title: string }[];
  }[];
};

type Data = {
  timetable: { viewerRoles: string[] } | null;
  dashboard: Dashboard | null;
};

const QUERY = `
  query Dashboard($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles }
    dashboard(idOrSlug: $s) {
      totalHearts electorCount hostCount slotCount
      topicCounts { draft submitted published unpublished archived }
      topicLeaderboard { id title hostName weightedScore heartCount }
      hostLeaderboard { hostId hostName weightedScore }
      unallocatedTopics { id title }
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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];

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
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Top topics (weighted)</h3>
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
                    {t.title}{" "}
                    <span className="faint">· {t.hostName ?? "Host"}</span>
                  </span>
                  <span className="mono">{t.weightedScore.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Hosts by weighted votes</h3>
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
                  <span>{h.hostName ?? "Host"}</span>
                  <span className="mono">{h.weightedScore.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
