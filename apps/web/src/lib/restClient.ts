import { auth } from "@clerk/nextjs/server";

import { env } from "@/env";

/**
 * Server-side REST fetch to the API (used from server actions). Attaches the
 * Clerk session token as a Bearer.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();

  return fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}
