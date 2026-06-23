import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  DigestSettingsForm,
  type DigestSettings,
} from "@/components/DigestSettingsForm";
import { ProfileForm } from "@/components/ProfileForm";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  me: {
    name: string | null;
    bio: string | null;
    email: string | null;
    notificationSettings: string;
  } | null;
};

const QUERY = `query { me { name bio email notificationSettings } }`;

export default async function ProfilePage() {
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

  return (
    <main className="container">
      <div className="page-head" style={{ marginBottom: 18 }}>
        <h1>Your account</h1>
        <p>{data.me.email}</p>
      </div>
      <div className="grid grid-2">
        <ProfileForm name={data.me.name} bio={data.me.bio} />
        <DigestSettingsForm current={digest} />
      </div>
    </main>
  );
}
