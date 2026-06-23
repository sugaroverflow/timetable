import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/timetables");

  return (
    <main className="container">
      <div className="brand" style={{ marginBottom: 24 }}>
        <span className="mark">T</span>
        <span>Timetable</span>
      </div>

      <div className="page-head" style={{ marginBottom: 20 }}>
        <h1>Make timetables, together.</h1>
        <p>
          Propose topics, vote with hearts, share availability, and let admins
          shape the schedule. One account, many timetables.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 440 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in with a magic link — no password required.
        </p>
        <Link className="btn btn-primary" href="/login">
          Get started
        </Link>
      </div>
    </main>
  );
}
