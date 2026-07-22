import { isAdmin, isHost, type Role } from "@timetable/shared";

import { CreateTopicForm } from "@/components/CreateTopicForm";
import { TopicManager } from "@/components/TopicManager";
import type { ManagedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  me: { id: string } | null;
  timetableHosts: { id: string; name: string | null }[];
  hostDashboard: ManagedTopic[];
};

const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

const QUERY = `
  query HostDashboard($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings }
    me { id }
    timetableHosts(idOrSlug: $s) { id name }
    hostDashboard(idOrSlug: $s) {
      id title slug hostSlug status bodyMd bodyHtml coverImageUrl updatedAt
      comments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
      hostOnlyComments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
      adminComments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
    }
  }
`;

export default async function MyTopicsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const hostLabel = roleLabel(settings.roleLabels, "host");
  const adminLabel = roleLabel(settings.roleLabels, "admin");

  if (!isHost(roles) && !isAdmin(roles)) {
    return (
      <div className="notice">
        You need the host or admin role in this forum to propose topics.
      </div>
    );
  }

  // Admins can create a topic owned by another host (round 2: populate a
  // pre-created account before its invite email goes out).
  const otherHosts = isAdmin(roles)
    ? data.timetableHosts.filter((h) => h.id !== data.me?.id)
    : undefined;

  return (
    <div className="grid grid-2">
      <CreateTopicForm slug={slug} hosts={otherHosts} hostLabel={hostLabel} />

      <div className="stack">
        <div className="page-head">
          <h2 className="section-title">My Topics</h2>
          <p>Create topics for an admin to publish, and unpublish your own.</p>
        </div>
        {data.hostDashboard.length === 0 ? (
          <div className="notice">No topics yet — create your first one.</div>
        ) : (
          <ul className="list">
            {data.hostDashboard.map((topic) => (
              <TopicManager
                key={topic.id}
                topic={topic}
                slug={slug}
                hostLabel={hostLabel}
                adminLabel={adminLabel}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
