import { notFound } from "next/navigation";

import { isAdmin, type Role } from "@timetable/shared";

import Link from "next/link";

import { HeartsCutoffForm } from "@/components/HeartsCutoffForm";
import { InviteForm } from "@/components/InviteForm";
import { SettingsForm, type SettingsValues } from "@/components/SettingsForm";
import { TimetableProfileForm } from "@/components/TimetableProfileForm";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";

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

  return (
    <div className="stack">
      <div className="grid grid-2">
        <TimetableProfileForm
          slug={slug}
          name={first.timetable.name}
          description={first.timetable.description}
          privacy={first.timetable.privacy}
          customDomain={first.timetable.customDomain}
          roleLabels={settings.roleLabels}
          digestDefaults={settings.digestDefaults}
        />
        <SettingsForm slug={slug} current={settings} />
      </div>

      <HeartsCutoffForm slug={slug} current={first.timetable.heartsCountFrom} />

      <div className="grid grid-2">
        <InviteForm timetableId={first.timetable.id} />

        <div className="stack">
          <div className="page-head">
            <h2 className="section-title">Members</h2>
            <p>
              Roles and bios are edited from the{" "}
              <Link href={`/t/${slug}/people`}>People page</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
