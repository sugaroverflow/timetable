import { clientTransport } from "@/lib/transport.client";

/** Browser fetch to the API with the Clerk session token as a Bearer.
 * Returns the raw Response; callers own error handling. */
export async function clientApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return clientTransport.rest(path, init);
}
