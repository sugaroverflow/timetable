import { isAdmin, type Role } from "@timetable/shared";

import { ModerationCard } from "@/components/ModerationCard";
import type { ManagedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  timetable: { viewerRoles: string[] } | null;
  moderationQueue: ManagedTopic[];
};

const QUERY = `
  query Moderation($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles }
    moderationQueue(idOrSlug: $s) {
      id title status bodyMd bodyHtml updatedAt feedback
    }
  }
`;

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];

  if (!isAdmin(roles)) {
    return <div className="notice">Admins only.</div>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Moderation queue</h2>
        <p>Review submitted topics and publish, request changes, or reject.</p>
      </div>
      <div className="backstage">
        <span style={{ fontSize: 17 }}>🛠</span>
        Backstage — actions here are logged to the activity log and visible to all admins.
      </div>
      {data.moderationQueue.length === 0 ? (
        <div className="notice">Nothing awaiting review.</div>
      ) : (
        <ul className="list">
          {data.moderationQueue.map((topic) => (
            <ModerationCard key={topic.id} topic={topic} slug={slug} />
          ))}
        </ul>
      )}
    </div>
  );
}
