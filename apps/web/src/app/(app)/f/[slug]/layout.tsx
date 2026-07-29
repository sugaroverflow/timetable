import { auth } from "@clerk/nextjs/server";
import { Flag, Heart } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { NavLink } from "@/components/NavLink";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  TimetableSwitcher,
  type SwitcherItem,
} from "@/components/TimetableSwitcher";
import { UserPreviewExit } from "@/components/UserPreview";
import { env } from "@/env";
import { emojiFavicon } from "@/lib/favicon";
import { gqlFetch } from "@/lib/graphql";
import { getMyTimetables } from "@/lib/myTimetables";
import {
  buildThemeCss,
  parseTimetableSettings,
  privacyDescription,
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
    timetable: forum(idOrSlug: $idOrSlug) {
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

/** One fetch per request even though both generateMetadata and the layout
 * need the timetable — the GraphQL transport is a no-store POST, so Next
 * won't dedupe it; React cache() does. */
const loadTimetable = cache(async (slug: string) => {
  const { timetable } = await gqlFetch<TimetableResult>(TIMETABLE_QUERY, {
    idOrSlug: slug,
  });
  return timetable;
});

/** Forum-branded tab: "<name> Topics" plus the forum's icon as favicon,
 * with the same emoji-over-upload precedence as the topbar/switcher. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const timetable = await loadTimetable(slug);
  if (!timetable) return {};
  const settings = parseTimetableSettings(timetable.settings);
  const icon = settings.iconEmoji
    ? emojiFavicon(settings.iconEmoji)
    : settings.iconUrl;
  // Feed readers autodiscover the Atom feed from any forum page; the feed
  // itself only exists for publicly readable forums (it has no auth).
  const hasFeed = !["private", "deactivated"].includes(timetable.privacy);
  return {
    title: `${timetable.name} Topics`,
    ...(icon ? { icons: { icon } } : {}),
    ...(hasFeed
      ? {
          alternates: {
            types: {
              "application/atom+xml": `${env.apiUrl}/api/forums/${slug}/feed.atom`,
            },
          },
        }
      : {}),
  };
}

const UNREAD_QUERY = `
  query Unread($s: String!) {
    notificationsUnread(idOrSlug: $s)
    topicQueue(idOrSlug: $s) { neverSeenCount }
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
): Promise<{
  switcherItems: SwitcherItem[];
  unread: number;
  queueNeverSeen: number;
}> {
  if (!isAuthed) return { switcherItems: [], unread: 0, queueNeverSeen: 0 };
  const [mine, unreadData] = await Promise.all([
    getMyTimetables(),
    isMember
      ? gqlFetch<{
          notificationsUnread: number;
          topicQueue: { neverSeenCount: number } | null;
        }>(UNREAD_QUERY, { s: slug })
      : Promise.resolve({ notificationsUnread: 0, topicQueue: null }),
  ]);
  const switcherItems = mine.map((t) => {
    const s = parseTimetableSettings(t.settings);
    return {
      slug: t.slug,
      name: t.name,
      privacy: t.privacy,
      iconUrl: s.iconUrl ?? null,
      iconDarkUrl: s.iconDarkUrl ?? null,
      iconEmoji: s.iconEmoji ?? null,
    };
  });
  return {
    switcherItems,
    unread: unreadData.notificationsUnread,
    queueNeverSeen: unreadData.topicQueue?.neverSeenCount ?? 0,
  };
}

function NotificationsNavLink({
  base,
  unread,
}: {
  base: string;
  unread: number;
}) {
  return (
    <NavLink href={`${base}/notifications`}>
      Notifications
      {unread > 0 ? (
        <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>
      ) : null}
    </NavLink>
  );
}

/** Elector-only. The badge is the never-seen count (the Analysis "Queue"
 * number) — always red, gone at zero; round restarts don't revive it. */
function QueueNavLink({
  base,
  neverSeen,
}: {
  base: string;
  neverSeen: number;
}) {
  return (
    <NavLink href={`${base}/queue`}>
      Topic Queue
      {neverSeen > 0 ? (
        <span className="nav-badge">{neverSeen > 99 ? "99+" : neverSeen}</span>
      ) : null}
    </NavLink>
  );
}

function SideNav({
  base,
  isAuthed,
  isMember,
  elector,
  hostOrAdmin,
  admin,
  unread,
  queueNeverSeen,
}: {
  base: string;
  isAuthed: boolean;
  isMember: boolean;
  elector: boolean;
  hostOrAdmin: boolean;
  admin: boolean;
  unread: number;
  queueNeverSeen: number;
}) {
  return (
    <nav className="nav side-nav">
      <NavLink href={`${base}/topics`} whenAbsent={["hearted"]}>
        All Topics
      </NavLink>
      {elector && <QueueNavLink base={base} neverSeen={queueNeverSeen} />}
      {hostOrAdmin && <NavLink href={`${base}/my-topics`}>My Topics</NavLink>}
      {elector && (
        <NavLink href={`${base}/topics?hearted=me`}>
          <Heart size={14} fill="currentColor" aria-hidden /> Topics
        </NavLink>
      )}
      {isMember && <NotificationsNavLink base={base} unread={unread} />}
      {/* People shows for every viewer who can read the forum — the API
          filters the list to the profiles their access allows (all members
          on public forums; hosts + admins on hosts_only ones). */}
      <NavLink href={`${base}/people`}>People</NavLink>
      {/* Profile moved to the topbar account menu (QA 2026-07-28). */}
      {hostOrAdmin && <NavLink href={`${base}/analysis`}>Analysis</NavLink>}
      {admin && <NavLink href={`${base}/moderation`}>Pending Topics</NavLink>}
      {admin && <NavLink href={`${base}/activity`}>Activity Log</NavLink>}
      {admin && <NavLink href={`${base}/settings`}>Forum Settings</NavLink>}
      {isMember && <NavLink href={`${base}/api`}>API</NavLink>}
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

  const timetable = await loadTimetable(slug);

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
  const base = `/f/${slug}`;
  const { switcherItems, unread, queueNeverSeen } = await loadSwitcherAndUnread(
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
          <SideNav
            base={base}
            isAuthed={isAuthed}
            isMember={isMember}
            elector={isElector(roles)}
            hostOrAdmin={isHost(roles) || isAdmin(roles)}
            admin={isAdmin(roles)}
            unread={unread}
            queueNeverSeen={queueNeverSeen}
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

          {/* Sidebar foot, one item per line (QA 2026-07-28): visibility,
              switcher, appearance, report a bug. The plain-English
              visibility line replaced the too-terse pill (QA 2026-07-27);
              the forum name lives in the topbar. */}
          <div className="sidebar-foot">
            <p className="faint sidebar-privacy">
              {privacyDescription(timetable.privacy, settings.roleLabels)}
            </p>
            {switcherItems.length > 0 ? (
              <TimetableSwitcher items={switcherItems} currentSlug={slug} />
            ) : null}
            <ThemeToggle />
            <a
              className="sidebar-bug-link faint"
              href="https://github.com/sugaroverflow/timetable/issues/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Flag size={14} aria-hidden /> Report a bug
            </a>
          </div>
        </Sidebar>

        <div className="shell-content">
          {settings.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="timetable-cover"
              src={settings.coverImageUrl}
              alt={`${timetable.name} cover image`}
            />
          ) : null}
          {children}
        </div>
      </div>
    </main>
  );
}
