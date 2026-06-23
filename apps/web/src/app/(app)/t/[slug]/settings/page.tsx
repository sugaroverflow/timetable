import { notFound } from "next/navigation";

import { isAdmin, type Role } from "@timetable/shared";

import { InviteForm } from "@/components/InviteForm";
import { MemberRolesEditor } from "@/components/MemberRolesEditor";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  timetable: {
    id: string;
    name: string;
    viewerRoles: string[];
  } | null;
  timetableMembers: {
    membershipId: string;
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
  const first = await gqlFetch<{ timetable: Data["timetable"] }>(
    `query($idOrSlug: String!) { timetable(idOrSlug: $idOrSlug) { id name viewerRoles } }`,
    { idOrSlug: slug },
  );
  if (!first.timetable) notFound();
  if (!isAdmin(first.timetable.viewerRoles as Role[])) {
    return (
      <div className="notice">You need an admin role to manage settings.</div>
    );
  }

  const data = await gqlFetch<Data>(QUERY, {
    idOrSlug: slug,
    timetableId: first.timetable.id,
  });

  return (
    <div className="grid grid-2">
      <InviteForm timetableId={first.timetable.id} />

      <div className="stack">
        <div className="page-head">
          <h2 style={{ fontSize: 18, margin: 0 }}>Members</h2>
          <p>Assign roles within this timetable.</p>
        </div>
        <ul className="list">
          {data.timetableMembers.map((m) => (
            <MemberRolesEditor
              key={m.membershipId}
              membershipId={m.membershipId}
              name={m.name}
              email={m.email}
              roles={m.roles}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
