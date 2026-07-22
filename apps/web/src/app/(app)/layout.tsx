import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

import { TopbarBrand, type BrandItem } from "@/components/TopbarBrand";
import { TopbarHamburger } from "@/components/TopbarHamburger";
import { ToastProvider } from "@/components/Toast";
import { gqlFetch } from "@/lib/graphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

type MenuData = {
  myTimetables: {
    timetable: { slug: string; name: string; settings: string };
  }[];
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

  let brandItems: BrandItem[] = [];
  if (userId) {
    const data = await gqlFetch<MenuData>(MENU_QUERY);
    brandItems = data.myTimetables.map((m) => {
      const s = parseTimetableSettings(m.timetable.settings);
      return {
        slug: m.timetable.slug,
        name: m.timetable.name,
        iconUrl: s.iconUrl ?? null,
        iconEmoji: s.iconEmoji ?? null,
      };
    });
  }

  return (
    <ToastProvider>
      <header className="topbar">
        <TopbarHamburger />
        <TopbarBrand
          items={brandItems}
          fallbackHref={userId ? "/timetables" : "/"}
        />
        <div className="spacer" />
        {userId ? (
          <>
            <Link
              className="muted topbar-email"
              href="/profile"
              style={{ fontSize: 13 }}
            >
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
