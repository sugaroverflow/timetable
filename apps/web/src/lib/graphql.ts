import { headers } from "next/headers";

import { env } from "@/env";

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

/**
 * Server-side GraphQL fetch that forwards the incoming session cookie so the
 * API can authenticate the request (shared Auth.js database session).
 */
export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const cookie = (await headers()).get("cookie") ?? "";

  const res = await fetch(env.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }
  if (!json.data) {
    throw new Error("GraphQL response had no data");
  }
  return json.data;
}
