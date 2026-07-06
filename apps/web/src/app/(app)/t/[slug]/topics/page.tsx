import { isHost, type Role } from "@timetable/shared";

import { CreateTopicForm } from "@/components/CreateTopicForm";
import { TopicManager } from "@/components/TopicManager";
import type { ManagedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";

type Data = {
  timetable: { viewerRoles: string[] } | null;
  hostDashboard: ManagedTopic[];
};

const QUERY = `
  query HostDashboard($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles }
    hostDashboard(idOrSlug: $s) {
      id title status bodyMd coverImageUrl updatedAt feedback
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

  if (!isHost(roles)) {
    return (
      <div className="notice">
        You need the host role in this timetable to propose topics.
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
              <TopicManager key={topic.id} topic={topic} slug={slug} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
