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
  draftTopics: ManagedTopic[];
};

const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

const QUERY = `
  query Moderation($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings }
    moderationQueue(idOrSlug: $s) {
      id title slug hostSlug hostName status bodyMd bodyHtml coverImageUrl updatedAt
      adminComments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
    }
    draftTopics(idOrSlug: $s) {
      id title slug hostSlug hostName updatedAt
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
          Review submitted topics: publish, edit, or discuss in the{" "}
          {adminLabel} comments.
        </p>
      </div>
      <h3 className="people-heading">Ready to publish</h3>
      {data.moderationQueue.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Queue is clear"
          hint="Nothing is waiting for review right now."
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

      {/* Every host's drafts, read-only — forgotten drafts stay visible
       * (QA #59). */}
      <h3 className="people-heading">Drafts</h3>
      {data.draftTopics.length === 0 ? (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          No drafts right now.
        </p>
      ) : (
        <ul className="list">
          {data.draftTopics.map((topic) => (
            <li key={topic.id} className="card">
              <div className="row wrap" style={{ alignItems: "baseline" }}>
                <strong>{topic.title}</strong>
                <span className="faint" style={{ fontSize: 12 }}>
                  {topic.hostName ?? hostLabel} · last edited{" "}
                  {new Date(topic.updatedAt).toLocaleDateString()}
                </span>
                <span style={{ flex: 1 }} />
                <span className="status-badge status-draft">draft</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
