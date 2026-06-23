import { getClerkToken } from "./clientAuth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Browser fetch to the API with the Clerk session token as a Bearer. */
export async function clientApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getClerkToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}
