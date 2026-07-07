import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { gqlFetch } from "@/lib/graphql";

/**
 * Landing resolver (QA #42): the timetable listing page is gone — the
 * topbar menu covers switching. Signed-in users are forwarded to the feed
 * of the timetable they last engaged with; users with no timetables go
 * to the new-timetable screen.
 */
export default async function TimetablesLandingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await gqlFetch<{ myLastVisitedTimetableSlug: string | null }>(
    `query { myLastVisitedTimetableSlug }`,
  );
  if (data.myLastVisitedTimetableSlug) {
    redirect(`/t/${data.myLastVisitedTimetableSlug}/feed`);
  }
  redirect("/timetables/new");
}
