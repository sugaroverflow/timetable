import Link from "next/link";

import { isHost as hasHostRole, type Role } from "@timetable/shared";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { RolePills } from "@/components/RolePills";
import { gqlFetch } from "@/lib/graphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

type Data = {
  timetable: { settings: string } | null;
  timetablePeople: {
    userId: string;
    name: string | null;
    roles: string[];
    bioHtml: string | null;
  }[];
};

const QUERY = `
  query People($s: String!) {
    timetable(idOrSlug: $s) { settings }
    timetablePeople(idOrSlug: $s) {
      userId name roles bioHtml
    }
  }
`;

/** Everyone in the timetable with their bio (QA #42). Hosts link to the
 * feed filtered to their topics. */
export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const settings = parseTimetableSettings(data.timetable?.settings);

  return (
    <div className="stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>People</h2>
        <p>Everyone in this timetable.</p>
      </div>
      {data.timetablePeople.length === 0 ? (
        <EmptyState
          icon="◎"
          title="No members yet"
          hint="Members appear here once they join."
        />
      ) : (
        <ul className="list">
          {data.timetablePeople.map((person) => (
            <li key={person.userId} className="card stack">
              <div className="row" style={{ alignItems: "center" }}>
                <Avatar name={person.name} />
                <div>
                  <strong>{person.name ?? "Member"}</strong>
                  <div style={{ marginTop: 4 }}>
                    <RolePills
                      roles={person.roles}
                      labels={settings.roleLabels}
                    />
                  </div>
                </div>
                <span style={{ flex: 1 }} />
                {hasHostRole(person.roles as Role[]) ? (
                  <Link
                    className="btn btn-ghost"
                    href={`/t/${slug}/feed?host=${person.userId}`}
                  >
                    View topics →
                  </Link>
                ) : null}
              </div>
              {person.bioHtml ? (
                <div
                  className="topic-body"
                  dangerouslySetInnerHTML={{ __html: person.bioHtml }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
