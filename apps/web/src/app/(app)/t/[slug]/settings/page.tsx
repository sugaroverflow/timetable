import { notFound } from "next/navigation";

import { isAdmin, type Role } from "@timetable/shared";

import { HeartsCutoffForm } from "@/components/HeartsCutoffForm";
import { InviteForm } from "@/components/InviteForm";
import { MemberRolesPicker } from "@/components/MemberRolesPicker";
import { SettingsForm, type SettingsValues } from "@/components/SettingsForm";
import { TimetableProfileForm } from "@/components/TimetableProfileForm";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";

type Data = {
  timetable: {
    id: string;
    name: string;
    viewerRoles: string[];
  } | null;
  timetableMembers: {
    membershipId: string;
    userId: string;
    roles: string[];
    name: string | null;
    email: string | null;
  }[];
};

const QUERY = `
  query Settings($idOrSlug: String!, $timetableId: String!) {
    timetable(idOrSlug: $idOrSlug) {
      id
      name
      viewerRoles
    }
    timetableMembers(timetableId: $timetableId) {
      membershipId
      userId
      roles
      name
      email
    }
  }
`;

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // First resolve the timetable id (members query needs the uuid).
  const first = await gqlFetch<{
    timetable:
      | {
          id: string;
          name: string;
          description: string | null;
          privacy: string;
          customDomain: string | null;
          heartsCountFrom: string | null;
          viewerRoles: string[];
          settings: string;
        }
      | null;
  }>(
    `query($idOrSlug: String!) { timetable(idOrSlug: $idOrSlug) { id name description privacy customDomain heartsCountFrom viewerRoles settings } }`,
    { idOrSlug: slug },
  );
  if (!first.timetable) notFound();
  const roles = await displayRolesFromCookies(
    first.timetable.viewerRoles as Role[],
  );
  if (!isAdmin(roles)) {
    return (
      <div className="notice">You need an admin role to manage settings.</div>
    );
  }

  let settings: SettingsValues = {};
  try {
    settings = JSON.parse(first.timetable.settings) as SettingsValues;
  } catch {
    settings = {};
  }

  const data = await gqlFetch<Data>(QUERY, {
    idOrSlug: slug,
    timetableId: first.timetable.id,
  });

  return (
    <div className="stack">
      <div className="grid grid-2">
        <TimetableProfileForm
          slug={slug}
          name={first.timetable.name}
          description={first.timetable.description}
          privacy={first.timetable.privacy}
          customDomain={first.timetable.customDomain}
        />
        <SettingsForm slug={slug} current={settings} />
      </div>

      <HeartsCutoffForm slug={slug} current={first.timetable.heartsCountFrom} />

      <div className="grid grid-2">
        <InviteForm timetableId={first.timetable.id} />

        <div className="stack">
          <div className="page-head">
            <h2 style={{ fontSize: 18, margin: 0 }}>Members</h2>
            <p>Select a member to edit their roles.</p>
          </div>
          <MemberRolesPicker
            slug={slug}
            members={data.timetableMembers}
            roleLabels={settings.roleLabels}
          />
        </div>
      </div>
    </div>
  );
}
