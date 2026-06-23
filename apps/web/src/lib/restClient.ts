import { headers } from "next/headers";

import { env } from "@/env";

/**
 * Server-side REST fetch to the API, forwarding the session cookie. Use from
 * server actions for mutations (create timetable, invites, role changes).
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";

  return fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}
