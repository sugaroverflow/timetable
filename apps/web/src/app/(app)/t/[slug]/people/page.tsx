import Link from "next/link";

import { isAdmin, type Role } from "@timetable/shared";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { PersonAdminPanel } from "@/components/PersonAdminPanel";
import { RolePills } from "@/components/RolePills";
import { UserPreviewStart } from "@/components/UserPreview";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  pluralLabel,
  roleLabel,
} from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

type Person = {
  userId: string;
  name: string | null;
  slug: string | null;
  roles: string[];
  bioHtml: string | null;
  publishedTopics: { id: string; title: string; slug: string | null }[];
};

type Data = {
  timetable: { id: string; settings: string; viewerRoles: string[] } | null;
  me: { id: string } | null;
  timetablePeople: Person[];
};

const QUERY = `
  query People($s: String!) {
    timetable(idOrSlug: $s) { id settings viewerRoles }
    me { id }
    timetablePeople(idOrSlug: $s) {
      userId name slug roles bioHtml
      publishedTopics { id title slug }
    }
  }
`;

type Member = {
  membershipId: string;
  userId: string;
  roles: string[];
  name: string | null;
  email: string | null;
};

const MEMBERS_QUERY = `
  query Members($timetableId: String!) {
    timetableMembers(timetableId: $timetableId) {
      membershipId userId roles name email
    }
  }
`;

/** Primary role for grouping: admins first, then hosts, then electors —
 * a multi-role member counts under their first (highest) role (QA #59). */
function primaryRole(roles: string[]): "admin" | "host" | "elector" {
  if (roles.includes("owner") || roles.includes("admin")) return "admin";
  if (roles.includes("host")) return "host";
  return "elector";
}

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const settings = parseTimetableSettings(data.timetable?.settings);
  const viewerRoles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const canEdit = isAdmin(viewerRoles) && data.timetable != null;

  // Membership ids (and emails) are admin-only — fetched separately so the
  // public People query never exposes them.
  let membersByUser = new Map<string, Member>();
  if (canEdit) {
    const members = await gqlFetch<{ timetableMembers: Member[] }>(
      MEMBERS_QUERY,
      { timetableId: data.timetable!.id },
    );
    membersByUser = new Map(
      members.timetableMembers.map((m) => [m.userId, m]),
    );
  }

  const sections = (["admin", "host", "elector"] as const).map((role) => ({
    role,
    heading: pluralLabel(roleLabel(settings.roleLabels, role)),
    people: data.timetablePeople.filter(
      (p) => primaryRole(p.roles) === role,
    ),
  }));

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">People</h2>
      </div>
      {data.timetablePeople.length === 0 ? (
        <EmptyState
          icon="◎"
          title="No members yet"
          hint="Members appear here once they join."
        />
      ) : (
        sections
          .filter((section) => section.people.length > 0)
          .map((section) => (
            <section key={section.role} className="stack">
              <h3 className="people-heading">{section.heading}</h3>
              <ul className="list">
                {section.people.map((person) => {
                  const member = membersByUser.get(person.userId);
                  const hasTopics = person.publishedTopics.length > 0;
                  const canPreview = canEdit && person.userId !== data.me?.id;
                  const canManage = canEdit && member != null;
                  return (
                    <li key={person.userId} className="card stack">
                      <div className="row" style={{ alignItems: "center" }}>
                        <Avatar name={person.name} large />
                        <div>
                          {hasTopics ? (
                            <Link
                              className="person-name-link"
                              href={`/t/${slug}/feed?host=${person.userId}`}
                            >
                              <strong>{person.name ?? "Member"}</strong>
                            </Link>
                          ) : (
                            <strong>{person.name ?? "Member"}</strong>
                          )}
                          <div style={{ marginTop: 4 }}>
                            <RolePills
                              roles={person.roles}
                              labels={settings.roleLabels}
                            />
                          </div>
                        </div>
                      </div>
                      {person.bioHtml ? (
                        <div
                          className="topic-body"
                          dangerouslySetInnerHTML={{ __html: person.bioHtml }}
                        />
                      ) : null}
                      {person.publishedTopics.length > 0 ? (
                        <div className="person-topics">
                          <div className="faint" style={{ fontSize: 12 }}>
                            Topics
                          </div>
                          <ul>
                            {person.publishedTopics.map((topic) => {
                              const href = topicPath(
                                slug,
                                person.slug,
                                topic.slug,
                              );
                              return (
                                <li key={topic.id}>
                                  {href ? (
                                    <Link href={href}>{topic.title}</Link>
                                  ) : (
                                    topic.title
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                      {canPreview || canManage ? (
                        <div
                          className="row people-card-actions"
                          style={{ alignItems: "center" }}
                        >
                          <span style={{ flex: 1 }} />
                          {canPreview ? (
                            <UserPreviewStart
                              slug={slug}
                              userId={person.userId}
                              name={person.name}
                            />
                          ) : null}
                          {canManage ? (
                            <PersonAdminPanel
                              membershipId={member!.membershipId}
                              userId={person.userId}
                              slug={slug}
                              name={member!.name}
                              email={member!.email}
                              roles={member!.roles}
                              roleLabels={settings.roleLabels}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
