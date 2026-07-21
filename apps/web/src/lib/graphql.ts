import { serverTransport } from "@/lib/transport.server";

/**
 * Server-side GraphQL fetch. Attaches the Clerk session token as a Bearer so
 * the API can authenticate; works anonymously too (no token → no header).
 * Behaviour lives in lib/transport.ts behind the TransportAuth seam.
 */
export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return serverTransport.gql<T>(query, variables);
}
