"use server";

import { signIn } from "@/auth";

export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return;
  // Sends the verification email and redirects to the "check your email" page.
  await signIn("resend", { email, redirectTo: "/timetables" });
}
