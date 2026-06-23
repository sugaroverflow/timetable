import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

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

  return (
    <>
      <header className="topbar">
        <Link className="brand" href={userId ? "/timetables" : "/"}>
          <span className="mark">T</span>
          <span>Timetable</span>
        </Link>
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
    </>
  );
}
