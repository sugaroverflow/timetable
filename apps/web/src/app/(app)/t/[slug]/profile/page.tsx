import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import type { DigestSettings } from "@/components/DigestSettingsForm";
import { ProfilePanel } from "@/components/ProfilePanel";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  me: { email: string | null; notificationSettings: string } | null;
  person: {
    name: string | null;
    bio: string | null;
    image: string | null;
  } | null;
};

const QUERY = `query Profile($s: String!) {
  me { email notificationSettings }
  person(idOrSlug: $s) { name bio image }
}`;

/** Profile inside the timetable shell (QA #59 round 3). Name/photo/bio are
 * per-forum (2026-07): this page edits the viewer's membership profile in
 * THIS forum; email and digests stay account-level. */
export default async function TimetableProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await gqlFetch<Data>(QUERY, { s: slug });
  if (!data.me) redirect("/sign-in");

  let digest: DigestSettings = {};
  try {
    digest = JSON.parse(data.me.notificationSettings) as DigestSettings;
  } catch {
    digest = {};
  }

  return (
    <ProfilePanel
      email={data.me.email}
      digest={digest}
      slug={slug}
      profile={data.person}
    />
  );
}
