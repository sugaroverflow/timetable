import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateTimetableForm } from "@/components/CreateTimetableForm";
import { EmptyState } from "@/components/EmptyState";
import { RolePills } from "@/components/RolePills";
import { gqlFetch } from "@/lib/graphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

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
      settings: string;
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
        settings
      }
    }
  }
`;

export default async function TimetablesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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
            <EmptyState
              icon="▦"
              title="No timetables yet"
              hint="Create one to get started, or ask an admin to invite you."
            />
          ) : (
            <ul className="list">
              {memberships.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/t/${m.timetable.slug}`}
                    className="card"
                    style={{ display: "block", padding: 0, overflow: "hidden" }}
                  >
                    {(() => {
                      const s = parseTimetableSettings(m.timetable.settings);
                      return s.coverImageUrl ? (
                        <div
                          style={{
                            height: 80,
                            backgroundImage: `url(${s.coverImageUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                      ) : null;
                    })()}
                    <div style={{ padding: "14px 16px" }}>
                      <div
                        className="row wrap"
                        style={{ justifyContent: "space-between" }}
                      >
                        <strong>{m.timetable.name}</strong>
                        <RolePills roles={m.roles} />
                      </div>
                      {m.timetable.description ? (
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
                          {m.timetable.description}
                        </p>
                      ) : null}
                      <p className="faint mono" style={{ margin: "6px 0 0", fontSize: 12 }}>
                        /{m.timetable.slug} · {m.timetable.privacy}
                      </p>
                    </div>
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
