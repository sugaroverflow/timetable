import { Pencil } from "lucide-react";
import Link from "next/link";

import { isAdmin, primaryRole, type Role } from "@timetable/shared";

import { AddPersonForm } from "@/components/AddPersonForm";
import { Avatar } from "@/components/Avatar";
import { CollapsibleTopicBody } from "@/components/CollapsibleTopicBody";
import { EmptyState } from "@/components/EmptyState";
import { InviteSendButton } from "@/components/InviteSendButton";
import { PersonAdminPanel } from "@/components/PersonAdminPanel";
import { PersonChip } from "@/components/PersonChip";
import { RolePills } from "@/components/RolePills";
import { UserPreviewStart } from "@/components/UserPreview";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  pluralLabel,
  roleLabel,
  type RoleLabels,
} from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

type Person = {
  userId: string;
  name: string | null;
  image: string | null;
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
    timetable: forum(idOrSlug: $s) { id settings viewerRoles }
    me { id }
    timetablePeople: forumPeople(idOrSlug: $s) {
      userId name image slug roles bioHtml
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
  inviteSentAt: string | null;
};

const MEMBERS_QUERY = `
  query Members($timetableId: String!) {
    timetableMembers: forumMembers(forumId: $timetableId) {
      membershipId userId roles name email inviteSentAt
    }
  }
`;

function personAnchor(userId: string): string {
  return `person-${userId}`;
}

type Section = { role: Role; heading: string; people: Person[] };

/**
 * The page's table of contents (QA 2026-08-16): every person, under their
 * role, in the order the sections below list them — a forum can carry a
 * lot of people, and jump links to three headings only told you where the
 * sections started. Role headings stack down the page with their people
 * flowing across and wrapping underneath (Ed's layout, 2026-08-16). The
 * heading still jumps to its section; each name jumps to that person's
 * card. Avatars ride along because a face is faster to find than a name.
 */
function PeopleContents({ sections }: { sections: Section[] }) {
  return (
    <nav className="people-toc card" aria-label="People on this page">
      {sections.map((section) => (
        <div key={section.role} className="people-toc-group">
          <a className="people-toc-heading" href={`#people-${section.role}`}>
            {section.heading}
            <span className="faint">{section.people.length}</span>
          </a>
          <div className="people-toc-people">
            {section.people.map((person) => (
              <a
                key={person.userId}
                className="people-toc-person"
                href={`#${personAnchor(person.userId)}`}
              >
                <Avatar name={person.name} image={person.image} small />
                {person.name ?? "Member"}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function PersonTopics({ slug, person }: { slug: string; person: Person }) {
  if (person.publishedTopics.length === 0) return null;
  return (
    <div className="person-topics">
      <div className="hint">Topics</div>
      <ul>
        {person.publishedTopics.map((topic) => {
          const href = topicPath(slug, person.slug, topic.slug);
          return (
            <li key={topic.id}>
              {href ? <Link href={href}>{topic.title}</Link> : topic.title}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PersonCardActions({
  slug,
  person,
  member,
  meId,
  canPreview,
  canManage,
  roleLabels,
}: {
  slug: string;
  person: Person;
  member: Member | undefined;
  meId: string | undefined;
  canPreview: boolean;
  canManage: boolean;
  roleLabels?: RoleLabels;
}) {
  if (!canPreview && !canManage) return null;
  return (
    <div className="people-card-actions">
      {canPreview ? (
        <UserPreviewStart
          slug={slug}
          userId={person.userId}
          name={person.name}
        />
      ) : null}
      {canManage && person.userId !== meId ? (
        <InviteSendButton
          membershipId={member!.membershipId}
          email={member!.email}
          inviteSentAt={member!.inviteSentAt}
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
          roleLabels={roleLabels}
        />
      ) : null}
    </div>
  );
}

function PersonCard({
  slug,
  person,
  member,
  meId,
  canEdit,
  roleLabels,
}: {
  slug: string;
  person: Person;
  member: Member | undefined;
  meId: string | undefined;
  canEdit: boolean;
  roleLabels?: RoleLabels;
}) {
  const canPreview = canEdit && person.userId !== meId;
  const canManage = canEdit && member != null;
  return (
    // The anchor every table-of-contents entry points at.
    <li className="card stack people-card" id={personAnchor(person.userId)}>
      <div className="person-head">
        {/* Photo and name both click through to the person's page (links
            pass 2026-08-03 — the name used to go to their filtered feed,
            and only when they had topics). */}
        <PersonChip slug={slug} userId={person.userId}>
          <Avatar name={person.name} image={person.image} xlarge />
        </PersonChip>
        {person.userId === meId ? (
          // The viewer's own card: straight to the profile editor
          // (QA 2026-07-29).
          <Link
            className="btn btn-ghost btn-sm person-head-edit"
            href={`/f/${slug}/profile`}
          >
            <Pencil size={14} aria-hidden /> Edit profile
          </Link>
        ) : null}
        {/* Name with its role pills on the same line, to the right
            (QA 2026-07-30). */}
        <div className="person-head-titles">
          <PersonChip slug={slug} userId={person.userId}>
            <strong>{person.name ?? "Member"}</strong>
          </PersonChip>
          <RolePills roles={person.roles} labels={roleLabels} />
        </div>
      </div>
      {person.bioHtml ? <CollapsibleTopicBody html={person.bioHtml} /> : null}
      <PersonTopics slug={slug} person={person} />
      <PersonCardActions
        slug={slug}
        person={person}
        member={member}
        meId={meId}
        canPreview={canPreview}
        canManage={canManage}
        roleLabels={roleLabels}
      />
    </li>
  );
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
    membersByUser = new Map(members.timetableMembers.map((m) => [m.userId, m]));
  }

  const sections = (["admin", "host", "elector"] as const).map((role) => ({
    role,
    heading: pluralLabel(roleLabel(settings.roleLabels, role)),
    people: data.timetablePeople
      .filter((p) => primaryRole(p.roles as Role[]) === role)
      .sort((a, b) =>
        (a.name ?? "Member").localeCompare(b.name ?? "Member", undefined, {
          sensitivity: "base",
        }),
      ),
  }));
  const visibleSections = sections.filter((s) => s.people.length > 0);

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">People</h2>
      </div>
      {canEdit ? (
        <AddPersonForm
          timetableId={data.timetable!.id}
          roleLabels={settings.roleLabels}
        />
      ) : null}
      {data.timetablePeople.length === 0 ? (
        <EmptyState
          icon="◎"
          title="No members yet"
          hint="Members appear here once they join."
        />
      ) : (
        <>
          {/* Below four people the page is its own contents. */}
          {data.timetablePeople.length > 3 ? (
            <PeopleContents sections={visibleSections} />
          ) : null}
          {visibleSections.map((section) => (
            <section
              key={section.role}
              id={`people-${section.role}`}
              className="stack people-section"
            >
              <h3 className="section-title">{section.heading}</h3>
              <ul className="list">
                {section.people.map((person) => (
                  <PersonCard
                    key={person.userId}
                    slug={slug}
                    person={person}
                    member={membersByUser.get(person.userId)}
                    meId={data.me?.id}
                    canEdit={canEdit}
                    roleLabels={settings.roleLabels}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
