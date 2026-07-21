import { clientTransport } from "@/lib/transport.client";

/** Browser GraphQL request with the Clerk session token as a Bearer.
 * Behaviour lives in lib/transport.ts behind the TransportAuth seam. */
export async function clientGql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return clientTransport.gql<T>(query, variables);
}
