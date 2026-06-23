import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { signOutAction } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/timetables">
          <span className="mark">T</span>
          <span>Timetable</span>
        </Link>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {session.user.email}
        </span>
        <form action={signOutAction}>
          <button className="btn btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </>
  );
}
