import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";

import { TimetableMenu, type TimetableMenuItem } from "@/components/TimetableMenu";
import { ToastProvider } from "@/components/Toast";
import { gqlFetch } from "@/lib/graphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

type MenuData = {
  myTimetables: { timetable: { slug: string; name: string; settings: string } }[];
};

const MENU_QUERY = `
  query TopbarMenu {
    myTimetables {
      timetable { slug name settings }
    }
  }
`;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No redirect here: public timetables are readable by anonymous visitors.
  // Pages that require a session enforce it themselves.
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  let menuItems: TimetableMenuItem[] = [];
  if (userId) {
    const data = await gqlFetch<MenuData>(MENU_QUERY);
    menuItems = data.myTimetables.map((m) => ({
      slug: m.timetable.slug,
      name: m.timetable.name,
      iconUrl: parseTimetableSettings(m.timetable.settings).iconUrl ?? null,
    }));
  }

  return (
    <ToastProvider>
      <header className="topbar">
        <Link className="brand" href={userId ? "/timetables" : "/"}>
          <Image
            className="brand-logo"
            src="/assets/timetable.love-logo-transparent.png"
            alt=""
            width={30}
            height={30}
            priority
          />
          <span>Timetable</span>
        </Link>
        {userId ? <TimetableMenu items={menuItems} /> : null}
        <div className="spacer" />
        {userId ? (
          <>
            <Link className="muted" href="/profile" style={{ fontSize: 13 }}>
              {email ?? "Account"}
            </Link>
            <UserButton />
          </>
        ) : (
          <Link className="btn" href="/sign-in">
            Sign in
          </Link>
        )}
      </header>
      {children}
    </ToastProvider>
  );
}
