import { notFound } from "next/navigation";

import { isAdmin, type Role } from "@timetable/shared";

import Link from "next/link";

import { CalendarSettingsForm } from "@/components/CalendarSettingsForm";
import { EmailDigestForm } from "@/components/EmailDigestForm";
import { HeartsCutoffForm } from "@/components/HeartsCutoffForm";
import { InviteForm } from "@/components/InviteForm";
import { SettingsForm, type SettingsValues } from "@/components/SettingsForm";
import { TimetableProfileForm } from "@/components/TimetableProfileForm";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { roleLabel, type TimetableSettings } from "@/lib/timetableSettings";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // First resolve the timetable id (members query needs the uuid).
  const first = await gqlFetch<{
    timetable: {
      id: string;
      name: string;
      privacy: string;
      customDomain: string | null;
      heartsCountFrom: string | null;
      viewerRoles: string[];
      settings: string;
    } | null;
  }>(
    `query($idOrSlug: String!) { timetable: forum(idOrSlug: $idOrSlug) { id name privacy customDomain heartsCountFrom viewerRoles settings } }`,
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
          privacy={first.timetable.privacy}
          customDomain={first.timetable.customDomain}
          roleLabels={settings.roleLabels}
        />
        <SettingsForm slug={slug} current={settings} />
      </div>

      {/* One "Forum settings" card (QA 2026-08-03): hearts cutoff,
          calendar, and digest defaults as subsections. */}
      <div className="card stack" style={{ gap: 16 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Forum settings
        </h2>

        <HeartsCutoffForm
          slug={slug}
          current={first.timetable.heartsCountFrom}
        />

        <hr className="settings-divider" />

        <CalendarSettingsForm
          slug={slug}
          current={(settings as TimetableSettings).calendar ?? {}}
          hostsPublishDirectly={Boolean(
            (settings as TimetableSettings).topics?.hostsPublishDirectly,
          )}
          hostLabel={roleLabel(settings.roleLabels, "host")}
          adminLabel={roleLabel(settings.roleLabels, "admin")}
        />

        <hr className="settings-divider" />

        <EmailDigestForm slug={slug} digestDefaults={settings.digestDefaults} />
      </div>

      <div className="grid grid-2">
        <InviteForm timetableId={first.timetable.id} />

        <div className="stack">
          <div className="page-head">
            <h2 className="page-title">Members</h2>
            <p>
              Roles and bios are edited from the{" "}
              <Link href={`/f/${slug}/people`}>People page</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
