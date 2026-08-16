import {
  isAdmin,
  isHost,
  isHostCommentsEnabled,
  type Role,
} from "@timetable/shared";

import { CreateTopicForm } from "@/components/CreateTopicForm";
import { CreateTopicReveal } from "@/components/CreateTopicReveal";
import { ListSortControl } from "@/components/ListSortControl";
import { TopicManager } from "@/components/TopicManager";
import { buildWorkbenchCalendar } from "@/lib/calendarPerms";
import type { ManagedTopic } from "@/lib/feedTypes";
import { commentTree, MANAGED_TOPIC_FIELDS } from "@/lib/gqlFragments";
import { gqlFetch } from "@/lib/graphql";
import {
  MY_TOPICS_SORTS,
  normalizeManagedSort,
  sortManagedTopics,
} from "@/lib/managedTopicSort";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  me: { id: string } | null;
  timetableHosts: { id: string; name: string | null }[];
  hostDashboard: ManagedTopic[];
};

const QUERY = `
  query HostDashboard($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    me { id }
    timetableHosts: forumHosts(idOrSlug: $s) { id name }
    hostDashboard(idOrSlug: $s) {
      ${MANAGED_TOPIC_FIELDS}
      viewerCommentsSeenAt
      hostHearters { userId name image slug }
      ${commentTree()}
      ${commentTree("hostOnlyComments")}
      ${commentTree("adminComments")}
    }
  }
`;

export default async function MyTopicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam } = await searchParams;
  const sort = normalizeManagedSort(sortParam, MY_TOPICS_SORTS);
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const hostLabel = roleLabel(settings.roleLabels, "host");
  const adminLabel = roleLabel(settings.roleLabels, "admin");
  const admin = isAdmin(roles);
  const workbenchCalendar = buildWorkbenchCalendar(
    settings,
    roles,
    data.me?.id ?? null,
  );

  if (!isHost(roles) && !admin) {
    return (
      <div className="notice">
        You need the host or admin role in this forum to propose topics.
      </div>
    );
  }

  // Admins can create a topic owned by another host (round 2: populate a
  // pre-created account before its invite email goes out).
  const otherHosts = admin
    ? data.timetableHosts.filter((h) => h.id !== data.me?.id)
    : undefined;

  return (
    <div className="grid">
      <div className="stack">
        <div className="page-head">
          <h2 className="page-title">My Topics</h2>
        </div>
        {/* Hidden behind the button until pressed; under the heading, same
            treatment as the calendar's propose button (QA 2026-08-03). */}
        <CreateTopicReveal>
          <CreateTopicForm
            slug={slug}
            hosts={otherHosts}
            hostLabel={hostLabel}
          />
        </CreateTopicReveal>
        {data.hostDashboard.length > 1 ? (
          <div className="toolbar feed-toolbar">
            <ListSortControl value={sort} options={MY_TOPICS_SORTS} />
          </div>
        ) : null}
        {data.hostDashboard.length === 0 ? (
          <div className="notice">No topics yet — create your first one.</div>
        ) : (
          <ul className="list">
            {sortManagedTopics(data.hostDashboard, sort).map((topic) => (
              <TopicManager
                key={topic.id}
                topic={topic}
                slug={slug}
                viewerId={data.me?.id ?? null}
                hostLabel={hostLabel}
                adminLabel={adminLabel}
                electorLabel={roleLabel(settings.roleLabels, "elector")}
                isAdmin={admin}
                hosts={admin ? data.timetableHosts : []}
                canPublishDirectly={Boolean(
                  settings.topics?.hostsPublishDirectly,
                )}
                calendar={workbenchCalendar}
                hostCommentsEnabled={isHostCommentsEnabled(settings)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
