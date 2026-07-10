import { auth } from "@clerk/nextjs/server";
import { Flag, Heart } from "lucide-react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { NavLink } from "@/components/NavLink";
import { RolePills } from "@/components/RolePills";
import { Sidebar } from "@/components/Sidebar";
import {
  TimetableSwitcher,
  type SwitcherItem,
} from "@/components/TimetableSwitcher";
import { UserPreviewExit } from "@/components/UserPreview";
import { gqlFetch } from "@/lib/graphql";
import {
  buildThemeCss,
  parseTimetableSettings,
  privacyBadge,
} from "@/lib/timetableSettings";
import { parseViewAs, VIEW_AS_COOKIE } from "@/lib/userPreview";

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

  // Under a view-as-user preview the API already resolves every query as
  // the target member, so these are the target's roles — no client-side
  // role games needed (QA #59 round 3).
  const roles = timetable.viewerRoles as Role[];
  const previewUserId = parseViewAs(
    (await cookies()).get(VIEW_AS_COOKIE)?.value,
    slug,
  );
  let previewName: string | null = null;
  if (previewUserId) {
    const data = await gqlFetch<{ person: { name: string | null } | null }>(
      `query($s: String!, $u: String!){ person(idOrSlug: $s, userId: $u){ name } }`,
      { s: slug, u: previewUserId },
    );
    previewName = data.person?.name ?? null;
  }
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
              <NavLink href={`${base}/feed?hearted=me`}>
                <Heart size={14} fill="currentColor" aria-hidden /> Topics
              </NavLink>
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
            {isAuthed && <NavLink href={`${base}/profile`}>Profile</NavLink>}
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

          {previewUserId ? (
            <div className="sidebar-foot">
              <UserPreviewExit
                slug={slug}
                userId={previewUserId}
                name={previewName}
              />
            </div>
          ) : null}

          <a
            className="sidebar-bug-link faint"
            href="https://github.com/sugaroverflow/timetable/issues/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Flag size={14} aria-hidden /> Report a bug
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
