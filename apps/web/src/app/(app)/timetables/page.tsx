import Link from "next/link";

import { CreateTimetableForm } from "@/components/CreateTimetableForm";
import { RolePills } from "@/components/RolePills";
import { gqlFetch } from "@/lib/graphql";

type MyTimetables = {
  myTimetables: {
    id: string;
    roles: string[];
    timetable: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      privacy: string;
    };
  }[];
};

const QUERY = `
  query MyTimetables {
    myTimetables {
      id
      roles
      timetable {
        id
        slug
        name
        description
        privacy
      }
    }
  }
`;

export default async function TimetablesPage() {
  const data = await gqlFetch<MyTimetables>(QUERY);
  const memberships = data.myTimetables;

  return (
    <main className="container">
      <div className="page-head" style={{ marginBottom: 18 }}>
        <h1>Your timetables</h1>
        <p>Switch between timetables you own or were invited to.</p>
      </div>

      <div className="grid grid-2">
        <div className="stack">
          {memberships.length === 0 ? (
            <div className="notice">
              You&rsquo;re not in any timetables yet. Create one to get started.
            </div>
          ) : (
            <ul className="list">
              {memberships.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/t/${m.timetable.slug}`}
                    className="card"
                    style={{ display: "block" }}
                  >
                    <div
                      className="row wrap"
                      style={{ justifyContent: "space-between" }}
                    >
                      <strong>{m.timetable.name}</strong>
                      <RolePills roles={m.roles} />
                    </div>
                    {m.timetable.description ? (
                      <p className="muted" style={{ margin: "8px 0 0" }}>
                        {m.timetable.description}
                      </p>
                    ) : null}
                    <p className="faint mono" style={{ margin: "8px 0 0", fontSize: 12 }}>
                      /{m.timetable.slug} · {m.timetable.privacy}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CreateTimetableForm />
      </div>
    </main>
  );
}
