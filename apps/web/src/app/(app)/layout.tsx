import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/AccountMenu";
import { DigestReadMarker } from "@/components/DigestReadMarker";
import { TopbarBrand, type BrandItem } from "@/components/TopbarBrand";
import { TopbarHamburger } from "@/components/TopbarHamburger";
import { TopbarHeightSync } from "@/components/TopbarHeightSync";
import { TopbarRoles } from "@/components/TopbarRoles";
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
        iconDarkUrl: s.iconDarkUrl ?? null,
        iconEmoji: s.iconEmoji ?? null,
      };
    });
  }

  return (
    <ToastProvider>
      {/* Digest links land on arbitrary app pages — watch them all for
          the ?dg= read-marker (Suspense: useSearchParams). */}
      {userId ? (
        <Suspense>
          <DigestReadMarker />
        </Suspense>
      ) : null}
      <header className="topbar">
        <TopbarHeightSync />
        <TopbarHamburger />
        <TopbarBrand
          items={brandItems}
          fallbackHref={userId ? "/timetables" : "/"}
        />
        <div className="spacer" />
        {userId ? (
          <>
            <TopbarRoles />
            <AccountMenu email={email} />
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
