import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { NavLink } from "@/components/NavLink";
import { RolePills } from "@/components/RolePills";
import { TimetableSwitcher } from "@/components/TimetableSwitcher";
import { gqlFetch } from "@/lib/graphql";

type TimetableResult = {
  timetable: {
    id: string;
    slug: string;
    name: string;
    privacy: string;
    viewerRoles: string[];
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
      viewerRoles
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

  const roles = timetable.viewerRoles as Role[];
  const base = `/t/${slug}`;

  return (
    <main className="container">
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
        {isAuthed ? <RolePills roles={roles} /> : null}
      </div>

      <div className="page-head" style={{ marginBottom: 14 }}>
        <h1>{timetable.name}</h1>
      </div>

      <nav className="nav" style={{ marginBottom: 18 }}>
        <NavLink href={base} exact>
          Overview
        </NavLink>
        <NavLink href={`${base}/feed`}>Topic feed</NavLink>
        {(isHost(roles) || isAdmin(roles)) && (
          <NavLink href={`${base}/dashboard`}>Dashboard</NavLink>
        )}
        {isHost(roles) && <NavLink href={`${base}/topics`}>My topics</NavLink>}
        {(isElector(roles) || isHost(roles) || isAdmin(roles)) && (
          <NavLink href={`${base}/calendar`}>Availability</NavLink>
        )}
        {isAdmin(roles) && (
          <NavLink href={`${base}/moderation`}>Moderation</NavLink>
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
