import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { userId } =
    process.env.E2E_TEST_MODE === "1" ? { userId: null } : await auth();
  if (userId) redirect("/timetables");

  return (
    <main className="container">
      <div className="brand" style={{ marginBottom: 24 }}>
        <span className="brand-logo" aria-hidden>
          📚
        </span>
        <span>Topic</span>
      </div>

      <div className="card" style={{ maxWidth: 440 }}>
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
