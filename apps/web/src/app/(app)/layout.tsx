import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

import { TopbarBrand, type BrandItem } from "@/components/TopbarBrand";
import { TopbarHamburger } from "@/components/TopbarHamburger";
import { ToastProvider } from "@/components/Toast";
import { getMyTimetables } from "@/lib/myTimetables";
import { parseTimetableSettings } from "@/lib/timetableSettings";

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
    const mine = await getMyTimetables();
    brandItems = mine.map((t) => {
      const s = parseTimetableSettings(t.settings);
      return {
        slug: t.slug,
        name: t.name,
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
