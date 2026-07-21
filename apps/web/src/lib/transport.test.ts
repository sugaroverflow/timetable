import { afterEach, describe, expect, it, vi } from "vitest";

import { createTransport, type TransportAuth } from "./transport";

function fakeAuth(token: string | null, viewAs?: string): TransportAuth {
  return {
    getToken: async () => token,
    getViewAs: async () => viewAs,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response) {
  const mock = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) => response,
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

type FetchMock = ReturnType<typeof stubFetch>;

function sentHeaders(mock: FetchMock): Record<string, string> {
  const init = mock.mock.calls[0]?.[1];
  return (init?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gql", () => {
  it("posts the query to the GraphQL URL and resolves data", async () => {
    const mock = stubFetch(jsonResponse({ data: { me: { id: "u1" } } }));
    const transport = createTransport(fakeAuth("tok"));

    const data = await transport.gql<{ me: { id: string } }>(
      "query Me { me { id } }",
      { a: 1 },
    );

    expect(data.me.id).toBe("u1");
    expect(mock.mock.calls[0]?.[0]).toBe("http://localhost:4000/graphql");
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      query: "query Me { me { id } }",
      variables: { a: 1 },
    });
  });

  it("sends Bearer and x-view-as headers when both are present", async () => {
    const mock = stubFetch(jsonResponse({ data: {} }));
    await createTransport(fakeAuth("tok", "slug:u2")).gql("{ __typename }");

    const headers = sentHeaders(mock);
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["x-view-as"]).toBe("slug:u2");
  });

  it("sends neither auth header when signed out, even with a view-as value", async () => {
    const mock = stubFetch(jsonResponse({ data: {} }));
    await createTransport(fakeAuth(null, "slug:u2")).gql("{ __typename }");

    const headers = sentHeaders(mock);
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-view-as"]).toBeUndefined();
  });

  it("surfaces the envelope error message, even on a non-ok status", async () => {
    stubFetch(jsonResponse({ errors: [{ message: "Not allowed" }] }, 400));
    await expect(
      createTransport(fakeAuth("tok")).gql("{ __typename }"),
    ).rejects.toThrow("Not allowed");
  });

  it("surfaces the HTTP status when the body has no envelope", async () => {
    stubFetch(new Response("Bad gateway", { status: 502 }));
    await expect(
      createTransport(fakeAuth("tok")).gql("{ __typename }"),
    ).rejects.toThrow("GraphQL request failed: 502");
  });

  it("throws when an ok response carries no data", async () => {
    stubFetch(jsonResponse({}));
    await expect(
      createTransport(fakeAuth("tok")).gql("{ __typename }"),
    ).rejects.toThrow("GraphQL response had no data");
  });
});

describe("rest", () => {
  it("joins the path onto the API URL and returns the raw Response", async () => {
    const mock = stubFetch(jsonResponse({ ok: true }, 201));
    const res = await createTransport(fakeAuth("tok")).rest("/api/timetables", {
      method: "POST",
    });

    expect(res.status).toBe(201);
    expect(mock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/timetables",
    );
  });

  it("sends Bearer but never x-view-as (REST is the write surface)", async () => {
    const mock = stubFetch(jsonResponse({}));
    await createTransport(fakeAuth("tok", "slug:u2")).rest("/api/x");

    const headers = sentHeaders(mock);
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["x-view-as"]).toBeUndefined();
  });

  it("lets caller-supplied headers override the defaults", async () => {
    const mock = stubFetch(jsonResponse({}));
    await createTransport(fakeAuth("tok")).rest("/api/x", {
      headers: { "Content-Type": "text/plain" },
    });

    expect(sentHeaders(mock)["Content-Type"]).toBe("text/plain");
  });

  it("returns error responses instead of throwing", async () => {
    stubFetch(jsonResponse({ error: "nope" }, 403));
    const res = await createTransport(fakeAuth(null)).rest("/api/x");
    expect(res.status).toBe(403);
  });
});
