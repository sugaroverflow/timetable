import { isAdmin, isHost, type Role } from "@timetable/shared";

import { ElectorActivityTable } from "@/components/ElectorActivityTable";
import { HostActivityTable } from "@/components/HostActivityTable";
import { HostFilter } from "@/components/HostFilter";
import { TopicLeaderboard } from "@/components/TopicLeaderboard";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  pluralLabel,
  roleLabel,
} from "@/lib/timetableSettings";

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
    commentTotal: number;
    commenterCount: number;
    commentL2: number;
    commentL1: number;
    commentDevotion: number;
  }[];
  hostActivity: {
    hostId: string;
    hostName: string | null;
    hostImage: string | null;
    hostSlug: string | null;
    topicCount: number;
    commentCount: number;
    latestActivityAt: string | null;
  }[];
  electorActivity: {
    electorId: string;
    electorName: string | null;
    heartCount: number;
    commentCount: number;
    queueCount: number;
    latestActivityAt: string | null;
    heartedTopics: {
      topicId: string;
      title: string;
      slug: string | null;
      hostId: string;
      hostName: string | null;
      hostSlug: string | null;
      commentCount: number;
    }[];
  }[];
};

type Data = {
  timetable: {
    viewerRoles: string[];
    settings: string;
  } | null;
  timetableHosts: { id: string; name: string | null }[];
  dashboard: Dashboard | null;
};

const QUERY = `
  query Dashboard($s: String!, $host: String, $activityHost: String) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    timetableHosts: forumHosts(idOrSlug: $s) { id name }
    dashboard(idOrSlug: $s, hostId: $host, activityHostId: $activityHost) {
      totalHearts electorCount hostCount
      topicLeaderboard { id title slug hostId hostName hostImage hostSlug weightedScore l2Score devotionScore heartCount commentTotal commenterCount commentL2 commentL1 commentDevotion }
      hostActivity { hostId hostName hostImage hostSlug topicCount commentCount latestActivityAt }
      electorActivity {
        electorId electorName heartCount commentCount queueCount
        latestActivityAt
        heartedTopics { topicId title slug hostId hostName hostSlug commentCount }
      }
    }
  }
`;

function ElectorActivityCard({
  slug,
  electorLabel,
  hostLabel,
  hostFilter,
  rows,
}: {
  slug: string;
  electorLabel: string;
  hostLabel: string;
  hostFilter: React.ReactNode;
  rows: Dashboard["electorActivity"];
}) {
  return (
    <div className="card">
      <div
        className="row wrap"
        style={{ justifyContent: "space-between", marginBottom: 12 }}
      >
        <h3 className="section-title">{electorLabel} activity</h3>
        {/* This table's own host filter: counts only activity on the
            chosen host's topics (independent of the topics table's). */}
        <span className="row wrap" style={{ gap: 10, alignItems: "center" }}>
          {hostFilter}
          <span className="faint" style={{ fontSize: 12 }}>
            {rows.length} shown
          </span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="faint" style={{ fontSize: 13 }}>
          No {pluralLabel(electorLabel).toLowerCase()} yet.
        </p>
      ) : (
        <ElectorActivityTable
          slug={slug}
          electorLabel={electorLabel}
          hostLabel={hostLabel}
          rows={rows}
        />
      )}
    </div>
  );
}

function HostActivityCard({
  slug,
  hostLabel,
  hostsPlural,
  adminsPlural,
  rows,
}: {
  slug: string;
  hostLabel: string;
  hostsPlural: string;
  adminsPlural: string;
  rows: Dashboard["hostActivity"];
}) {
  return (
    <div className="card">
      <div
        className="row wrap"
        style={{ justifyContent: "space-between", marginBottom: 12 }}
      >
        <div>
          <h3 className="section-title">{hostLabel} activity</h3>
          <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
            Only visible to {adminsPlural.toLowerCase()}
          </p>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>
          {rows.length} shown
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="faint" style={{ fontSize: 13 }}>
          No {hostsPlural.toLowerCase()} yet.
        </p>
      ) : (
        <HostActivityTable slug={slug} hostLabel={hostLabel} rows={rows} />
      )}
    </div>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ host?: string; activityHost?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const host = sp.host ?? "";
  const activityHost = sp.activityHost ?? "";
  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    host: host || null,
    activityHost: activityHost || null,
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
  const adminsPlural = pluralLabel(roleLabel(settings.roleLabels, "admin"));
  const viewerIsAdmin = isAdmin(roles);

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">Analysis</h2>
      </div>

      <TopicLeaderboard
        slug={slug}
        hostLabel={hostLabel}
        entries={d.topicLeaderboard}
        totalHearts={d.totalHearts}
        hostCount={d.hostCount}
        electorCount={d.electorCount}
        electorLabel={electorLabel}
        hostFilter={
          <HostFilter
            value={host}
            hosts={data.timetableHosts}
            allLabel={`All ${hostsPlural}`}
          />
        }
      />

      <ElectorActivityCard
        slug={slug}
        electorLabel={electorLabel}
        hostLabel={hostLabel}
        rows={d.electorActivity}
        hostFilter={
          <HostFilter
            value={activityHost}
            hosts={data.timetableHosts}
            allLabel={`All ${hostsPlural}`}
            param="activityHost"
          />
        }
      />

      {viewerIsAdmin ? (
        <HostActivityCard
          slug={slug}
          hostLabel={hostLabel}
          hostsPlural={hostsPlural}
          adminsPlural={adminsPlural}
          rows={d.hostActivity}
        />
      ) : null}
    </div>
  );
}
