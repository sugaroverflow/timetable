import { env } from "@/env";

/**
 * The one deep module for talking to the API. Everything invariant lives
 * here: URL resolution (via @/env, the single source of the fallbacks),
 * bearer-header assembly, x-view-as forwarding, and GraphQL envelope
 * handling. The only thing that varies between environments is how auth is
 * read — that's the TransportAuth seam, satisfied by two adapters:
 * transport.server.ts (Clerk request auth + next/headers cookies) and
 * transport.client.ts (Clerk browser bundle + document.cookie).
 */
export type TransportAuth = {
  /** Clerk session token, or null when signed out/anonymous. */
  getToken(): Promise<string | null>;
  /** Path-scoped view-as-user preview value (QA #59 round 3), if active.
   * Only ever forwarded alongside a token; the API re-verifies admin
   * rights on every request. */
  getViewAs(): Promise<string | undefined>;
};

export type Transport = {
  gql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  rest(path: string, init?: RequestInit): Promise<Response>;
};

type GraphQLEnvelope<T> = {
  data?: T;
  errors?: { message: string }[];
};

export function createTransport(auth: TransportAuth): Transport {
  async function authHeaders(
    withViewAs: boolean,
  ): Promise<Record<string, string>> {
    const token = await auth.getToken();
    if (!token) return {};
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (withViewAs) {
      const viewAs = await auth.getViewAs();
      if (viewAs) headers["x-view-as"] = viewAs;
    }
    return headers;
  }

  /** GraphQL POST. Envelope errors win over HTTP status (a 400 with a
   * validation message surfaces the message, not the code); a non-ok
   * response without a parseable envelope surfaces the status. */
  const gql = async <T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> => {
    const res = await fetch(env.graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders(true)),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    let json: GraphQLEnvelope<T> | undefined;
    try {
      json = (await res.json()) as GraphQLEnvelope<T>;
    } catch {
      json = undefined;
    }
    if (json?.errors?.length) {
      throw new Error(json.errors[0]?.message ?? "GraphQL error");
    }
    if (!res.ok) {
      throw new Error(`GraphQL request failed: ${res.status}`);
    }
    if (!json?.data) {
      throw new Error("GraphQL response had no data");
    }
    return json.data;
  };

  /** REST fetch; returns the raw Response — callers own error handling.
   * Deliberately does NOT forward x-view-as: previews are read-only and
   * the REST surface is all writes, which the API blocks under preview. */
  const rest = async (path: string, init?: RequestInit): Promise<Response> => {
    return fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders(false)),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  };

  return { gql, rest };
}
