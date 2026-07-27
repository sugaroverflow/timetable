"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/restClient";

export type CreateTimetableState = { error?: string };

export async function createTimetableAction(
  _prev: CreateTimetableState,
  formData: FormData,
): Promise<CreateTimetableState> {
  const name = String(formData.get("name") ?? "").trim();
  const privacy = String(formData.get("privacy") ?? "private");
  const slug = String(formData.get("slug") ?? "").trim();

  if (!name) return { error: "Name is required" };

  const res = await apiFetch("/api/forums", {
    method: "POST",
    body: JSON.stringify({
      name,
      privacy,
      slug: slug || undefined,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Failed to create forum" };
  }

  const timetable = (await res.json()) as { slug: string };
  revalidatePath("/timetables");
  redirect(`/f/${timetable.slug}`);
}
