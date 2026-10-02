import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { gqlFetch } from "@/lib/graphql";

/** Data-less pushes open a fresh, authenticated list. Nothing private is stored
 * in the worker and the current account's membership gates every destination. */
export default async function NotificationsLandingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fnotifications");
  const { myForums } = await gqlFetch<{
    myForums: { forum: { id: string; slug: string; name: string } }[];
  }>(`query { myForums { forum { id slug name } } }`);
  return (
    <div className="stack">
      <h1 className="page-title">Notifications</h1>
      <p>Choose a forum to see your activity.</p>
      {myForums.map(({ forum }) => (
        <Link key={forum.id} href={`/f/${forum.slug}/notifications`}>
          {forum.name}
        </Link>
      ))}
      {myForums.length === 0 ? <p>No forums to show.</p> : null}
    </div>
  );
}
