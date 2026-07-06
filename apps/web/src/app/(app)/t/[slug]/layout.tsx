import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { isAdmin, isHost, type Role } from "@timetable/shared";

import { NavLink } from "@/components/NavLink";
import { PreviewToggle } from "@/components/PreviewToggle";
import { RolePills } from "@/components/RolePills";
import { TimetableSwitcher } from "@/components/TimetableSwitcher";
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

type ListResult = {
  myTimetables: { timetable: { slug: string; name: string } }[];
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

const LIST_QUERY = `
  query SwitcherList {
    myTimetables {
      timetable {
        slug
        name
      }
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

  const [{ timetable }, list] = await Promise.all([
    gqlFetch<TimetableResult>(TIMETABLE_QUERY, { idOrSlug: slug }),
    isAuthed
      ? gqlFetch<ListResult>(LIST_QUERY)
      : Promise.resolve({ myTimetables: [] } as ListResult),
  ]);

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

  return (
    <main className="container" style={themeStyle(settings)}>
      <div
        className="row wrap"
        style={{ justifyContent: "space-between", marginBottom: 14 }}
      >
        {isAuthed && list.myTimetables.length > 0 ? (
          <TimetableSwitcher
            current={slug}
            options={list.myTimetables.map((m) => m.timetable)}
          />
        ) : (
          <span className="faint mono" style={{ fontSize: 12 }}>
            /{slug}
          </span>
        )}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {isHost(actualRoles) || isAdmin(actualRoles) ? (
            <PreviewToggle
              on={previewOn}
              slug={slug}
              electorLabel={roleLabel(settings.roleLabels, "elector")}
            />
          ) : null}
          {isAuthed ? (
            <RolePills roles={roles} labels={settings.roleLabels} />
          ) : null}
          {(() => {
            const privacyConfig = {
              public:      { dot: "var(--green)",  label: "Public" },
              private:     { dot: "var(--yellow)", label: "Private" },
              deactivated: { dot: "var(--faint)",  label: "Deactivated" },
            };
            const cfg =
              privacyConfig[timetable.privacy as keyof typeof privacyConfig] ??
              { dot: "var(--faint)", label: timetable.privacy };
            return (
              <span className="privacy-pill">
                <span className="privacy-dot" style={{ background: cfg.dot }} />
                {cfg.label}
              </span>
            );
          })()}
        </div>
      </div>

      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>{timetable.name}</h1>
        <p className="mono faint" style={{ fontSize: 12, margin: "4px 0 0" }}>
          {timetable.customDomain ?? `timetable.love/t/${slug}`}
        </p>
      </div>
      {settings.coverImageUrl ? (
        <div
          className="timetable-cover"
          style={{ backgroundImage: `url(${settings.coverImageUrl})` }}
          aria-label={`${timetable.name} cover image`}
        />
      ) : null}

      <nav className="nav" style={{ marginBottom: 18 }}>
        <NavLink href={`${base}/feed`}>Topic feed</NavLink>
        {isHost(roles) && (
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
        {isAdmin(roles) && <NavLink href={`${base}/settings`}>Settings</NavLink>}
      </nav>

      {children}
    </main>
  );
}
