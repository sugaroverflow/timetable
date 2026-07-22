import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { CreateTimetableForm } from "@/components/CreateTimetableForm";

/** The "make a new timetable" screen — reached from the topbar timetable
 * menu's last item, and the landing page for users with no timetables. */
export default async function NewTimetablePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="container" style={{ maxWidth: 560 }}>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <h1>New forum</h1>
        <p>Create a forum to start collecting topics and availability.</p>
      </div>
      <CreateTimetableForm />
    </main>
  );
}
