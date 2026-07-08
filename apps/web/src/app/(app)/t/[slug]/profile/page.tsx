import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import type { DigestSettings } from "@/components/DigestSettingsForm";
import { ProfilePanel } from "@/components/ProfilePanel";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  me: {
    name: string | null;
    bio: string | null;
    email: string | null;
    image: string | null;
    notificationSettings: string;
  } | null;
};

const QUERY = `query { me { name bio email image notificationSettings } }`;

/** Profile inside the timetable shell (QA #59 round 3) — same sidebar and
 * theme as every other page. The profile itself is global to the user. */
export default async function TimetableProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await gqlFetch<Data>(QUERY);
  if (!data.me) redirect("/sign-in");

  let digest: DigestSettings = {};
  try {
    digest = JSON.parse(data.me.notificationSettings) as DigestSettings;
  } catch {
    digest = {};
  }

  return <ProfilePanel me={data.me} digest={digest} />;
}
