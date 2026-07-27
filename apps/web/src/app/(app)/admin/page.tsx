import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteForumButton } from "@/components/DeleteForumButton";
import { NewForumEmailToggle } from "@/components/NewForumEmailToggle";
import { gqlFetch } from "@/lib/graphql";

export const metadata: Metadata = { title: "Sysadmin — Topic" };

type SysadminForum = {
  id: string;
  slug: string;
  name: string;
  privacy: string;
  createdAt: string;
  memberCount: number;
  activeMemberCount: number;
  topicCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
};

type Data = {
  me: { isSysadmin: boolean; notificationSettings: string } | null;
  sysadminForums: SysadminForum[];
};

const QUERY = `
  query Sysadmin {
    me { isSysadmin notificationSettings }
    sysadminForums {
      id slug name privacy createdAt
      memberCount activeMemberCount topicCount
      ownerName ownerEmail
    }
  }
`;

export default async function SysadminPage() {
  const data = await gqlFetch<Data>(QUERY);
  if (!data.me?.isSysadmin) notFound();

  let newForumEmails = false;
  try {
    const prefs = JSON.parse(data.me.notificationSettings) as {
      newForumEmails?: boolean;
    };
    newForumEmails = prefs.newForumEmails ?? false;
  } catch {
    // Unparseable settings fall back to off.
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Sysadmin</h2>
        <p>
          Every forum in this deployment. &ldquo;Active&rdquo; counts members
          who viewed the forum&rsquo;s topics in the last 30 days.
        </p>
      </div>

      <NewForumEmailToggle current={newForumEmails} />

      {data.sysadminForums.length === 0 ? (
        <div className="notice">No forums exist yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Forum</th>
                <th>Privacy</th>
                <th>Created</th>
                <th>Members</th>
                <th>Active (30d)</th>
                <th>Topics</th>
                <th>Owner</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.sysadminForums.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/f/${f.slug}/topics`}>{f.name}</Link>
                  </td>
                  <td>{f.privacy}</td>
                  <td>{f.createdAt.slice(0, 10)}</td>
                  <td>{f.memberCount}</td>
                  <td>{f.activeMemberCount}</td>
                  <td>{f.topicCount}</td>
                  <td>
                    {f.ownerName ?? "—"}
                    {f.ownerEmail ? (
                      <>
                        {" "}
                        <a className="faint" href={`mailto:${f.ownerEmail}`}>
                          {f.ownerEmail}
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <DeleteForumButton id={f.id} slug={f.slug} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
