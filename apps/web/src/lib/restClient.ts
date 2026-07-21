import { serverTransport } from "@/lib/transport.server";

/** Server-side REST fetch to the API (used from server actions). Returns the
 * raw Response; callers own error handling. */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return serverTransport.rest(path, init);
}
