import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { NavLink } from "@/components/NavLink";
import { PreviewToggle } from "@/components/PreviewToggle";
import { RolePills } from "@/components/RolePills";
import { Sidebar } from "@/components/Sidebar";
import {
  TimetableSwitcher,
  type SwitcherItem,
} from "@/components/TimetableSwitcher";
import { gqlFetch } from "@/lib/graphql";
import { displayRoles, PREVIEW_COOKIE } from "@/lib/previewRoles";
import {
  buildThemeCss,
  parseTimetableSettings,
  privacyBadge,
  roleLabel,
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

type MineResult = {
  myTimetables: {
    timetable: { slug: string; name: string; privacy: string; settings: string };
  }[];
};

const MINE_QUERY = `
  query SidebarSwitcher {
    myTimetables {
      timetable { slug name privacy settings }
    }
  }
`;

const UNREAD_QUERY = `
  query Unread($s: String!) {
    notificationsUnread(idOrSlug: $s)
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
  const privacy = privacyBadge(timetable.privacy);

  let switcherItems: SwitcherItem[] = [];
  let unread = 0;
  if (isAuthed) {
    const [mine, unreadData] = await Promise.all([
      gqlFetch<MineResult>(MINE_QUERY),
      roles.length > 0
        ? gqlFetch<{ notificationsUnread: number }>(UNREAD_QUERY, { s: slug })
        : Promise.resolve({ notificationsUnread: 0 }),
    ]);
    switcherItems = mine.myTimetables.map((m) => ({
      slug: m.timetable.slug,
      name: m.timetable.name,
      privacy: m.timetable.privacy,
      iconUrl: parseTimetableSettings(m.timetable.settings).iconUrl ?? null,
    }));
    unread = unreadData.notificationsUnread;
  }

  const themeCss = buildThemeCss(settings);

  return (
    <main className="container">
      {/* The timetable's theme applies globally (topbar included) while
       * this layout is mounted; dark overrides ride the same tag. */}
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
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
            {isElector(roles) && (
              <NavLink href={`${base}/feed?hearted=me`}>❤️ Topics</NavLink>
            )}
            {roles.length > 0 && (
              <NavLink href={`${base}/notifications`}>
                Notifications
                {unread > 0 ? (
                  <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>
                ) : null}
              </NavLink>
            )}
            {roles.length > 0 && (
              <NavLink href={`${base}/people`}>People</NavLink>
            )}
            {isAuthed && <NavLink href="/profile">Profile</NavLink>}
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

          <a
            className="sidebar-bug-link faint"
            href="https://github.com/sugaroverflow/timetable/issues/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            ⚑ Report a bug
          </a>

          {switcherItems.length > 0 ? (
            <div className="sidebar-foot">
              <TimetableSwitcher items={switcherItems} currentSlug={slug} />
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
