import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { env } from "@/env";
import { VIEW_AS_COOKIE } from "@/lib/userPreview";

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

/**
 * Server-side GraphQL fetch. Attaches the Clerk session token as a Bearer so
 * the API can authenticate. Works anonymously too (no token → no header).
 */
export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  // Path-scoped view-as-user preview cookie (QA #59 round 3): forwarded as
  // a header; the API re-verifies admin rights on every request.
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;

  const res = await fetch(env.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token && viewAs ? { "x-view-as": viewAs } : {}),
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
