import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ProfilePanel } from "@/components/ProfilePanel";
import { gqlFetch } from "@/lib/graphql";
import { parseDigestSettings } from "@/lib/timetableSettings";

type Data = {
  me: { email: string | null; notificationSettings: string } | null;
  myLastVisitedTimetableSlug: string | null;
};

const QUERY = `query {
  me { email notificationSettings }
  myLastVisitedTimetableSlug: myLastVisitedForumSlug
}`;

/** Standalone profile route: users inside a timetable get the in-shell
 * version (QA #59 round 3), so redirect there when we know where they
 * live. Profiles are per-forum (2026-07), so this fallback page is
 * account-only: email, appearance, digests. */
export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await gqlFetch<Data>(QUERY);
  if (!data.me) redirect("/sign-in");

  if (data.myLastVisitedTimetableSlug) {
    redirect(`/f/${data.myLastVisitedTimetableSlug}/profile`);
  }

  const digest = parseDigestSettings(data.me.notificationSettings);

  return (
    <main className="container">
      <ProfilePanel
        email={data.me.email}
        digest={digest}
        slug={null}
        profile={null}
      />
    </main>
  );
}
