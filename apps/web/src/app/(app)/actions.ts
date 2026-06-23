"use server";

import { signOut } from "@/auth";

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
