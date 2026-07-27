import Link from "next/link";

import { personPath } from "@/lib/personPath";
import type { RoleLabels } from "@/lib/timetableSettings";

import { Avatar } from "./Avatar";
import { RolePills } from "./RolePills";

export type ProfileCardPerson = {
  userId: string;
  name: string | null;
  image: string | null;
  slug: string | null;
  roles: string[];
  bioHtml: string | null;
};

/** Profile header shared by the host-filtered feed and the person pages
 * (/f/[slug]/[userSlug]): large photo, name, role pills, bio. The photo
 * links to the person page unless this card IS that page. */
export function PersonProfileCard({
  slug,
  person,
  labels,
  linkPhoto = true,
}: {
  slug: string;
  person: ProfileCardPerson;
  labels: RoleLabels | undefined;
  linkPhoto?: boolean;
}) {
  const pagePath = person.slug ? personPath(slug, person.slug) : null;
  const photo = person.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="profile-photo-xl"
      src={person.image}
      alt={person.name ?? "Member"}
    />
  ) : (
    <Avatar name={person.name} image={null} large />
  );
  return (
    <div className="card stack">
      <div className="row" style={{ alignItems: "center" }}>
        {linkPhoto && pagePath ? (
          <Link href={pagePath} className="profile-photo-link">
            {photo}
          </Link>
        ) : (
          photo
        )}
        <div>
          <strong>{person.name ?? "Member"}</strong>
          <div style={{ marginTop: "var(--space-1)" }}>
            <RolePills roles={person.roles} labels={labels} />
          </div>
        </div>
      </div>
      {person.bioHtml ? (
        <div
          className="topic-body"
          dangerouslySetInnerHTML={{ __html: person.bioHtml }}
        />
      ) : null}
    </div>
  );
}
