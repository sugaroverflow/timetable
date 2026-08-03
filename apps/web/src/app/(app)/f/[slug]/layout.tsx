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
    calendarHasSlots: boolean;
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
      calendarHasSlots
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
    moderationQueue(idOrSlug: $s) { id }
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
  pendingCount: number;
}> {
  if (!isAuthed)
    return { switcherItems: [], unread: 0, queueNeverSeen: 0, pendingCount: 0 };
  const [mine, unreadData] = await Promise.all([
    getMyTimetables(),
    isMember
      ? gqlFetch<{
          notificationsUnread: number;
          topicQueue: { neverSeenCount: number } | null;
          moderationQueue: { id: string }[];
        }>(UNREAD_QUERY, { s: slug })
      : Promise.resolve({
          notificationsUnread: 0,
          topicQueue: null,
          moderationQueue: [],
        }),
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
    pendingCount: unreadData.moderationQueue?.length ?? 0,
  };
}

/** Non-admins see the Calendar link only once slots exist (QA 2026-08-03)
 * — admins need it regardless, to set the schedule up. */
function calendarNavVisible(
  settings: ReturnType<typeof parseTimetableSettings>,
  roles: Role[],
  hasSlots: boolean,
): boolean {
  if (!settings.calendar?.enabled) return false;
  return isAdmin(roles) || hasSlots;
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
        <span className="nav-badge">{unread > 999 ? "999+" : unread}</span>
      ) : null}
    </NavLink>
  );
}

/** Every member (v2 2026-07-29 — hosts asked for the queue too). The
 * badge is the never-seen count (the Analysis "Queue" number), gone at
 * zero; round restarts don't revive it, moving the ❤️-count-from cutoff
 * does. Red for electors (the reading is their vote); grey for everyone
 * else — they don't get in trouble for not doing the reading. */
function QueueNavLink({
  base,
  neverSeen,
  elector,
}: {
  base: string;
  neverSeen: number;
  elector: boolean;
}) {
  return (
    <NavLink href={`${base}/queue`}>
      Topic Queue
      {neverSeen > 0 ? (
        <span className={`nav-badge${elector ? "" : " nav-badge-quiet"}`}>
          {neverSeen > 999 ? "999+" : neverSeen}
        </span>
      ) : null}
    </NavLink>
  );
}

function PendingNavLink({
  base,
  pendingCount,
}: {
  base: string;
  pendingCount: number;
}) {
  return (
    <NavLink href={`${base}/pending`}>
      Pending Topics
      {pendingCount > 0 ? (
        <span className="nav-badge">
          {pendingCount > 999 ? "999+" : pendingCount}
        </span>
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
  calendarOn,
  unread,
  queueNeverSeen,
  pendingCount,
}: {
  base: string;
  isAuthed: boolean;
  isMember: boolean;
  elector: boolean;
  hostOrAdmin: boolean;
  admin: boolean;
  calendarOn: boolean;
  unread: number;
  queueNeverSeen: number;
  pendingCount: number;
}) {
  return (
    <nav className="nav side-nav">
      <NavLink href={`${base}/topics`} whenAbsent={["hearted"]}>
        All Topics
      </NavLink>
      {isMember && (
        <QueueNavLink
          base={base}
          neverSeen={queueNeverSeen}
          elector={elector}
        />
      )}
      {hostOrAdmin && <NavLink href={`${base}/my-topics`}>My Topics</NavLink>}
      {elector && (
        <NavLink href={`${base}/topics?hearted=me`}>
          <Heart size={14} fill="currentColor" aria-hidden /> Topics
        </NavLink>
      )}
      {/* Calendar v2 (closes #55): the link exists only when the forum has
          switched the feature on. */}
      {calendarOn && <NavLink href={`${base}/calendar`}>Calendar</NavLink>}
      {isMember && <NotificationsNavLink base={base} unread={unread} />}
      {/* People shows for every viewer who can read the forum — the API
          filters the list to the profiles their access allows (all members
          on public forums; hosts + admins on hosts_only ones). */}
      <NavLink href={`${base}/people`}>People</NavLink>
      {/* Also in the topbar account menu — kept here too for discoverability
          (QA 2026-07-30). */}
      {isAuthed && <NavLink href={`${base}/profile`}>Profile</NavLink>}
      {hostOrAdmin && <NavLink href={`${base}/analysis`}>Analysis</NavLink>}
      {admin && <PendingNavLink base={base} pendingCount={pendingCount} />}
      {admin && <NavLink href={`${base}/log`}>Activity Log</NavLink>}
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
  const { switcherItems, unread, queueNeverSeen, pendingCount } =
    await loadSwitcherAndUnread(isAuthed, isMember, slug);

  const themeCss = buildThemeCss(settings);

  // Non-members can only be looking at a private/deactivated forum via
  // sysadmin operator access (guards block everyone else) — make the
  // privileged mode unmistakable and state that it's read-only.
  const sysadminView =
    !isMember && ["private", "deactivated"].includes(timetable.privacy);

  return (
    <main className="container">
      {/* The timetable's theme applies globally (topbar included) while
       * this layout is mounted; dark overrides ride the same tag. */}
      {themeCss ? (
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      ) : null}
      {sysadminView ? (
        <div className="notice sysadmin-banner">
          Sysadmin view — you are reading a {timetable.privacy} forum with
          operator access. Read-only; members cannot see you here.
        </div>
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
            calendarOn={calendarNavVisible(
              settings,
              roles,
              timetable.calendarHasSlots,
            )}
            unread={unread}
            queueNeverSeen={queueNeverSeen}
            pendingCount={pendingCount}
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
