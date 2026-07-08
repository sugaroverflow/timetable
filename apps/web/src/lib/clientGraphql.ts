import { getClerkToken } from "./clientAuth";

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";

/** Path-scoped view-as-user preview cookie (QA #59 round 3), if present
 * on this page's path. The API re-verifies admin rights per request. */
function viewAsHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(/(?:^|; )view-as-user=([^;]+)/);
  return match?.[1]
    ? { "x-view-as": decodeURIComponent(match[1]) }
    : {};
}

/** Browser GraphQL request with the Clerk session token as a Bearer. */
export async function clientGql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = await getClerkToken();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token ? viewAsHeader() : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }
  if (!json.data) throw new Error("No data returned");
  return json.data;
}
