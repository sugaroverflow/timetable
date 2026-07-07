import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { isAdmin, isHost, type Role } from "@timetable/shared";

import { NavLink } from "@/components/NavLink";
import { PreviewToggle } from "@/components/PreviewToggle";
import { RolePills } from "@/components/RolePills";
import { Sidebar } from "@/components/Sidebar";
import { gqlFetch } from "@/lib/graphql";
import { displayRoles, PREVIEW_COOKIE } from "@/lib/previewRoles";
import {
  parseTimetableSettings,
  roleLabel,
  themeStyle,
} from "@/lib/timetableSettings";

type TimetableResult = {
  timetable: {
    id: string;
    slug: string;
    name: string;
    privacy: string;
    customDomain: string | null;
    viewerRoles: string[];
    settings: string;
  } | null;
};

const TIMETABLE_QUERY = `
  query Timetable($idOrSlug: String!) {
    timetable(idOrSlug: $idOrSlug) {
      id
      slug
      name
      privacy
      customDomain
      viewerRoles
      settings
    }
  }
`;

export default async function TimetableLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  const isAuthed = Boolean(userId);

  const { timetable } = await gqlFetch<TimetableResult>(TIMETABLE_QUERY, {
    idOrSlug: slug,
  });

  // Not readable: prompt anonymous visitors to sign in (it may be private);
  // signed-in users simply can't see it.
  if (!timetable) {
    if (!isAuthed) redirect("/sign-in");
    notFound();
  }

  const actualRoles = timetable.viewerRoles as Role[];
  const previewOn =
    (await cookies()).get(PREVIEW_COOKIE)?.value === "1" &&
    (isHost(actualRoles) || isAdmin(actualRoles));
  const roles = displayRoles(actualRoles, previewOn);
  const settings = parseTimetableSettings(timetable.settings);
  const base = `/t/${slug}`;

  const privacyConfig = {
    public: { dot: "var(--green)", label: "Public" },
    private: { dot: "var(--yellow)", label: "Private" },
    deactivated: { dot: "var(--faint)", label: "Deactivated" },
  };
  const privacy =
    privacyConfig[timetable.privacy as keyof typeof privacyConfig] ?? {
      dot: "var(--faint)",
      label: timetable.privacy,
    };

  return (
    <main className="container" style={themeStyle(settings)}>
      <div className="shell">
        <Sidebar>
          <div className="sidebar-head">
            <div className="sidebar-title">{timetable.name}</div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="privacy-pill">
                <span
                  className="privacy-dot"
                  style={{ background: privacy.dot }}
                />
                {privacy.label}
              </span>
            </div>
            {isAuthed ? (
              <RolePills roles={roles} labels={settings.roleLabels} />
            ) : null}
          </div>

          <nav className="nav side-nav">
            <NavLink href={`${base}/feed`}>Topic feed</NavLink>
            {(isHost(roles) || isAdmin(roles)) && (
              <NavLink href={`${base}/topics`}>My Topics</NavLink>
            )}
            {(isHost(roles) || isAdmin(roles)) && (
              <NavLink href={`${base}/dashboard`}>Dashboard</NavLink>
            )}
            {isAdmin(roles) && (
              <NavLink href={`${base}/moderation`}>Pending Topics</NavLink>
            )}
            {isAdmin(roles) && (
              <NavLink href={`${base}/activity`}>Activity</NavLink>
            )}
            {isAdmin(roles) && (
              <NavLink href={`${base}/settings`}>Settings</NavLink>
            )}
          </nav>

          {isHost(actualRoles) || isAdmin(actualRoles) ? (
            <div className="sidebar-foot">
              <PreviewToggle
                on={previewOn}
                slug={slug}
                electorLabel={roleLabel(settings.roleLabels, "elector")}
              />
            </div>
          ) : null}
        </Sidebar>

        <div className="shell-content">
          {settings.coverImageUrl ? (
            <div
              className="timetable-cover"
              style={{ backgroundImage: `url(${settings.coverImageUrl})` }}
              aria-label={`${timetable.name} cover image`}
            />
          ) : null}
          {children}
        </div>
      </div>
    </main>
  );
}
