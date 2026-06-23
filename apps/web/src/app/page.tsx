import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/timetables");

  return (
    <main className="container">
      <div className="brand" style={{ marginBottom: 24 }}>
        <Image
          className="brand-logo"
          src="/assets/timetable.love-logo-transparent.png"
          alt=""
          width={36}
          height={36}
          priority
        />
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
          Sign in to create and join timetables.
        </p>
        <div className="row">
          <Link className="btn btn-primary" href="/sign-in">
            Sign in
          </Link>
          <Link className="btn" href="/sign-up">
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
