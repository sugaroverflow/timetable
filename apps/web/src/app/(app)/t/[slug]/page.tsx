import { redirect } from "next/navigation";

// The Overview tab was removed (QA #42): a timetable's home is its feed.
export default async function TimetableIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/feed`);
}
