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
import { getMyTimetables } from "@/lib/myTimetables";
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

const UNREAD_QUERY = `
  query Unread($s: String!) {
    notificationsUnread(idOrSlug: $s)
  }
`;

/** Under a view-as-user preview the API already resolves every query as
 * the target member, so viewerRoles are the target's roles — no client-side
 * role games needed (QA #59 round 3). This resolves who is being previewed. */
async function loadPreview(slug: string) {
  const previewUserId = parseViewAs(
    (await cookies()).get(VIEW_AS_COOKIE)?.value,
    slug,
  );
  if (!previewUserId) {
    return { previewUserId: null, previewName: null };
  }
  const data = await gqlFetch<{ person: { name: string | null } | null }>(
    `query($s: String!, $u: String!){ person(idOrSlug: $s, userId: $u){ name } }`,
    { s: slug, u: previewUserId },
  );
  return { previewUserId, previewName: data.person?.name ?? null };
}

async function loadSwitcherAndUnread(
  isAuthed: boolean,
  isMember: boolean,
  slug: string,
): Promise<{ switcherItems: SwitcherItem[]; unread: number }> {
  if (!isAuthed) return { switcherItems: [], unread: 0 };
  const [mine, unreadData] = await Promise.all([
    getMyTimetables(),
    isMember
      ? gqlFetch<{ notificationsUnread: number }>(UNREAD_QUERY, { s: slug })
      : Promise.resolve({ notificationsUnread: 0 }),
  ]);
  const switcherItems = mine.map((t) => {
    const s = parseTimetableSettings(t.settings);
    return {
      slug: t.slug,
      name: t.name,
      privacy: t.privacy,
      iconUrl: s.iconUrl ?? null,
      iconEmoji: s.iconEmoji ?? null,
    };
  });
  return { switcherItems, unread: unreadData.notificationsUnread };
}

function SideNav({
  base,
  isAuthed,
  isMember,
  elector,
  hostOrAdmin,
  admin,
  unread,
}: {
  base: string;
  isAuthed: boolean;
  isMember: boolean;
  elector: boolean;
  hostOrAdmin: boolean;
  admin: boolean;
  unread: number;
}) {
  return (
    <nav className="nav side-nav">
      <NavLink href={`${base}/feed`}>Topic Feed</NavLink>
      {hostOrAdmin && <NavLink href={`${base}/topics`}>My Topics</NavLink>}
      {elector && (
        <NavLink href={`${base}/feed?hearted=me`}>
          <Heart size={14} fill="currentColor" aria-hidden /> Topics
        </NavLink>
      )}
      {isMember && (
        <NavLink href={`${base}/notifications`}>
          Notifications
          {unread > 0 ? (
            <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>
          ) : null}
        </NavLink>
      )}
      {isMember && <NavLink href={`${base}/people`}>People</NavLink>}
      {isAuthed && <NavLink href={`${base}/profile`}>Profile</NavLink>}
      {hostOrAdmin && <NavLink href={`${base}/dashboard`}>Analysis</NavLink>}
      {admin && <NavLink href={`${base}/moderation`}>Pending Topics</NavLink>}
      {admin && <NavLink href={`${base}/activity`}>Activity Log</NavLink>}
      {admin && <NavLink href={`${base}/settings`}>Settings</NavLink>}
    </nav>
  );
}

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

  const roles = timetable.viewerRoles as Role[];
  const isMember = roles.length > 0;
  const { previewUserId, previewName } = await loadPreview(slug);
  const settings = parseTimetableSettings(timetable.settings);
  const base = `/t/${slug}`;
  const privacy = privacyBadge(timetable.privacy);
  const { switcherItems, unread } = await loadSwitcherAndUnread(
    isAuthed,
    isMember,
    slug,
  );

  const themeCss = buildThemeCss(settings);

  return (
    <main className="container">
      {/* The timetable's theme applies globally (topbar included) while
       * this layout is mounted; dark overrides ride the same tag. */}
      {themeCss ? (
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      ) : null}
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

          <SideNav
            base={base}
            isAuthed={isAuthed}
            isMember={isMember}
            elector={isElector(roles)}
            hostOrAdmin={isHost(roles) || isAdmin(roles)}
            admin={isAdmin(roles)}
            unread={unread}
          />

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
