import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyTimetables } from "@/lib/myTimetables";

/**
 * notifications-chooser (Web Push step 4, docs/web-push-plan.md §1): where
 * the service worker sends a tap on its fallback alert ("Topic — You have
 * new activity"), shown only when a push arrives without a readable
 * payload. Every real alert names its forum and item and opens that
 * directly, so this is just a list of the viewer's forums, each linking to
 * its Notifications page — never a one-forum shortcut (plan §2), since a
 * fallback can't say which forum it was about.
 */
export default async function NotificationsChooserPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fnotifications");
  const forums = await getMyTimetables();

  return (
    <main className="container stack">
      <h2 className="page-title">Notifications</h2>
      {forums.length > 0 ? (
        <>
          <p className="muted">Choose a forum to see its notifications.</p>
          <ul className="list">
            {forums.map((forum) => (
              <li key={forum.slug} className="card">
                <Link href={`/f/${forum.slug}/notifications`}>
                  {forum.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">You&rsquo;re not in any forums yet.</p>
      )}
    </main>
  );
}
