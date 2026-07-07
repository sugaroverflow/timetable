import { isAdmin, type Role } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { ModerationCard } from "@/components/ModerationCard";
import type { ManagedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  moderationQueue: ManagedTopic[];
};

const QUERY = `
  query Moderation($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings }
    moderationQueue(idOrSlug: $s) {
      id title slug hostSlug hostName status bodyMd bodyHtml coverImageUrl updatedAt feedback
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
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const adminLabel = roleLabel(settings.roleLabels, "admin");

  if (!isAdmin(roles)) {
    return <div className="notice">{adminLabel}s only.</div>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Pending topics</h2>
        <p>Review submitted topics and publish, request changes, or reject.</p>
      </div>
      <div className="backstage">
        <span style={{ fontSize: 17 }}>🛠</span>
        Backstage — actions here are logged to the activity log and visible to
        all {adminLabel.toLowerCase()}s.
      </div>
      {data.moderationQueue.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Queue is clear"
          hint="Nothing is waiting for review right now."
        />
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
