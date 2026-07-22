import { isAdmin, type Role } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { ModerationCard } from "@/components/ModerationCard";
import type { ManagedTopic } from "@/lib/feedTypes";
import { commentTree } from "@/lib/gqlFragments";
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
      id title slug hostSlug hostName status bodyMd bodyHtml coverImageUrl updatedAt
      ${commentTree("adminComments")}
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
  const hostLabel = roleLabel(settings.roleLabels, "host");

  if (!isAdmin(roles)) {
    return <div className="notice">{adminLabel}s only.</div>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Pending topics</h2>
        <p>
          Review submitted topics: publish, edit, or discuss in the {adminLabel}{" "}
          comments.
        </p>
      </div>
      <h3 className="people-heading">Unpublished Topics</h3>
      {data.moderationQueue.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Queue is clear"
          hint="Nothing is waiting to be published right now."
        />
      ) : (
        <ul className="list">
          {data.moderationQueue.map((topic) => (
            <ModerationCard
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
  );
}
