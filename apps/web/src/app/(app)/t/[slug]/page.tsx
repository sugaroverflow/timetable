import { notFound } from "next/navigation";

import { gqlFetch } from "@/lib/graphql";

type TimetableResult = {
  timetable: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    privacy: string;
    viewerRoles: string[];
  } | null;
};

const QUERY = `
  query TimetableOverview($idOrSlug: String!) {
    timetable(idOrSlug: $idOrSlug) {
      id
      slug
      name
      description
      privacy
      viewerRoles
    }
  }
`;

export default async function TimetableOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { timetable } = await gqlFetch<TimetableResult>(QUERY, {
    idOrSlug: slug,
  });
  if (!timetable) notFound();

  return (
    <div className="stack">
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Overview</h2>
        <p className="muted">
          {timetable.description ?? "No description yet."}
        </p>
        <p className="faint mono" style={{ fontSize: 12 }}>
          Privacy: {timetable.privacy} · Your roles:{" "}
          {timetable.viewerRoles.join(", ") || "none"}
        </p>
      </div>

      <div className="notice">
        The topic feed, availability calendar, and moderation queue arrive in
        Phase 1. The foundation — accounts, timetables, roles, and invites — is
        live now.
      </div>
    </div>
  );
}
