import { isAdmin, type Role } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { ListSortControl } from "@/components/ListSortControl";
import { ModerationCard } from "@/components/ModerationCard";
import type { ManagedTopic } from "@/lib/feedTypes";
import { commentTree } from "@/lib/gqlFragments";
import { gqlFetch } from "@/lib/graphql";
import {
  normalizeManagedSort,
  PENDING_SORTS,
  sortManagedTopics,
} from "@/lib/managedTopicSort";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  timetableHosts: { id: string; name: string | null }[];
  moderationQueue: ManagedTopic[];
};

const QUERY = `
  query Moderation($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    timetableHosts: forumHosts(idOrSlug: $s) { id name }
    moderationQueue(idOrSlug: $s) {
      id title slug hostId hostSlug hostName hostImage status bodyMd bodyHtml coverImageUrl updatedAt
      ${commentTree("adminComments")}
    }
  }
`;

export default async function ModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam } = await searchParams;
  const sort = normalizeManagedSort(sortParam, PENDING_SORTS);
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
        <h2 className="page-title">Pending topics</h2>
        <p>
          Review submitted topics: publish, edit, or discuss in the {adminLabel}{" "}
          comments.
        </p>
      </div>
      <h3 className="section-title">Unpublished Topics</h3>
      {data.moderationQueue.length > 1 ? (
        <div className="toolbar feed-toolbar">
          <ListSortControl value={sort} options={PENDING_SORTS} />
        </div>
      ) : null}
      {data.moderationQueue.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Queue is clear"
          hint="Nothing is waiting to be published right now."
        />
      ) : (
        <ul className="list">
          {sortManagedTopics(data.moderationQueue, sort).map((topic) => (
            <ModerationCard
              key={topic.id}
              topic={topic}
              slug={slug}
              hostLabel={hostLabel}
              adminLabel={adminLabel}
              hosts={data.timetableHosts}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
