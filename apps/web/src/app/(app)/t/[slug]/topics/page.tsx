import { isAdmin, isHost, type Role } from "@timetable/shared";

import { CreateTopicForm } from "@/components/CreateTopicForm";
import { TopicManager } from "@/components/TopicManager";
import type { ManagedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  hostDashboard: ManagedTopic[];
};

const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

const QUERY = `
  query HostDashboard($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings }
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
        You need the host or admin role in this timetable to propose topics.
      </div>
    );
  }

  return (
    <div className="grid grid-2">
      <CreateTopicForm slug={slug} />

      <div className="stack">
        <div className="page-head">
          <h2 style={{ fontSize: 18, margin: 0 }}>My Topics</h2>
          <p>Draft, submit for review, and unpublish your topics.</p>
        </div>
        {data.hostDashboard.length === 0 ? (
          <div className="notice">No topics yet — create your first draft.</div>
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
