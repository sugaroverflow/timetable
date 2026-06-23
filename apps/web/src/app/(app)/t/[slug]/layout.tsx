import { notFound } from "next/navigation";

import { isAdmin, isHost, type Role } from "@timetable/shared";

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

  const [{ timetable }, list] = await Promise.all([
    gqlFetch<TimetableResult>(TIMETABLE_QUERY, { idOrSlug: slug }),
    gqlFetch<ListResult>(LIST_QUERY),
  ]);

  if (!timetable) notFound();

  const roles = timetable.viewerRoles as Role[];
  const base = `/t/${slug}`;

  return (
    <main className="container">
      <div
        className="row wrap"
        style={{ justifyContent: "space-between", marginBottom: 14 }}
      >
        <TimetableSwitcher
          current={slug}
          options={list.myTimetables.map((m) => m.timetable)}
        />
        <RolePills roles={roles} />
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
          <NavLink href={`${base}/calendar`}>Availability</NavLink>
        )}
        {isAdmin(roles) && (
          <NavLink href={`${base}/moderation`}>Moderation</NavLink>
        )}
        {isAdmin(roles) && <NavLink href={`${base}/settings`}>Settings</NavLink>}
      </nav>

      {children}
    </main>
  );
}
