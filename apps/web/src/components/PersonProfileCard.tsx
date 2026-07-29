import { Pencil } from "lucide-react";
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
  isSelf = false,
}: {
  slug: string;
  person: ProfileCardPerson;
  labels: RoleLabels | undefined;
  linkPhoto?: boolean;
  /** This is the viewer's own profile: show the edit link to
   * /f/[slug]/profile (QA 2026-07-29). */
  isSelf?: boolean;
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
      {/* Portrait with the name and role pills beneath (QA 2026-07-28).
       * The name is the page's top heading — tier 1 of the hierarchy. */}
      <div className="profile-head">
        {linkPhoto && pagePath ? (
          <Link href={pagePath} className="profile-photo-link">
            {photo}
          </Link>
        ) : (
          photo
        )}
        <h1 className="page-title">{person.name ?? "Member"}</h1>
        <RolePills roles={person.roles} labels={labels} />
        {isSelf ? (
          <Link className="btn btn-ghost btn-sm" href={`/f/${slug}/profile`}>
            <Pencil size={14} aria-hidden /> Edit profile
          </Link>
        ) : null}
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
