import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

import { matchVanityRoute, type VanityRoute } from "@timetable/shared";

import { e2eTestMode, env } from "@/env";
import { canonicalHosts, redirectTargetHost } from "@/lib/canonicalHost";
import { buildCsp, mintNonce } from "@/lib/csp";

// Next 16 renamed the "middleware" convention to "proxy". Clerk attaches auth
// to every request; route-level access control is enforced in layouts/pages
// (public timetables stay readable while anonymous).
type RoutesLookup = {
  data?: { forumRoutesByHost?: VanityRoute[] };
  errors?: { message?: string }[];
};

const ROUTES_QUERY = `
  query VanityRoutes($host: String!) {
    forumRoutesByHost(host: $host) { slug pathPrefix }
  }
`;

// vanity-address: every route on a host, cached per host — an empty list
// too, so a stray host pointed at us doesn't re-query on every hit.
const routeCache = new Map<
  string,
  { routes: VanityRoute[]; expiresAt: number }
>();

type SlugLookup = {
  data?: { forumCanonicalSlug?: string | null };
  errors?: { message?: string }[];
};

const SLUG_QUERY = `
  query CanonicalSlug($slug: String!) {
    forumCanonicalSlug(slug: $slug)
  }
`;

// Canonical slug per requested slug (editable slugs, 2026-08-10). Unknown
// slugs cache as null so 404-ish paths don't re-query every hit.
const slugCache = new Map<
  string,
  { canonical: string | null; expiresAt: number }
>();

const FORUM_PATH_RE = /^\/f\/([^/]+)(\/.*)?$/;

function normalizeHost(host: string | null): string {
  return (host ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function requestHost(request: NextRequest): string {
  return (
    normalizeHost(request.headers.get("x-forwarded-host")) ||
    normalizeHost(request.headers.get("host"))
  );
}

function isCustomHost(host: string): boolean {
  if (!host) return false;
  if (canonicalHosts().has(host)) return false;
  if (host.endsWith(".localhost")) return false;
  if (host.endsWith(".vercel.app")) return false;
  return true;
}

/** One GraphQL round-trip: host → its vanity routes (empty when none).
 * Network and GraphQL failures are logged by name and resolve to null so
 * the caller can decline to cache them. */
async function fetchHostRoutes(
  host: string,
  graphqlUrl: string,
): Promise<VanityRoute[] | null> {
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ROUTES_QUERY, variables: { host } }),
  });
  if (!res.ok) {
    console.warn(
      `[web] vanity address lookup failed for ${host}: GraphQL returned ${res.status}`,
    );
    return null;
  }
  const json = (await res.json()) as RoutesLookup;
  if (json.errors?.length) {
    console.warn(
      `[web] vanity address lookup failed for ${host}: ${json.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ")}`,
    );
    return null;
  }
  return json.data?.forumRoutesByHost ?? [];
}

function routeGraphqlUrl(): string {
  return (
    process.env.GRAPHQL_ROUTE_URL ??
    process.env.NEXT_PUBLIC_GRAPHQL_URL ??
    "http://localhost:4000/graphql"
  );
}

async function lookupHostRoutes(host: string): Promise<VanityRoute[]> {
  const now = Date.now();
  const cached = routeCache.get(host);
  if (cached && cached.expiresAt > now) return cached.routes;

  try {
    const routes = await fetchHostRoutes(host, routeGraphqlUrl());
    if (routes) routeCache.set(host, { routes, expiresAt: now + 60_000 });
    return routes ?? [];
  } catch (error) {
    console.warn(`[web] vanity address lookup failed for ${host}`, error);
    return [];
  }
}

/** One GraphQL round-trip: any slug → the forum's canonical slug (null when
 * unknown). Failures resolve to null — the page then renders via the API's
 * own slug-history fallback, just without the redirect. */
async function lookupCanonicalSlug(slug: string): Promise<string | null> {
  const now = Date.now();
  const cached = slugCache.get(slug);
  if (cached && cached.expiresAt > now) return cached.canonical;

  try {
    const res = await fetch(routeGraphqlUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: SLUG_QUERY, variables: { slug } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as SlugLookup;
    if (json.errors?.length) return null;
    const canonical = json.data?.forumCanonicalSlug ?? null;
    slugCache.set(slug, { canonical, expiresAt: now + 60_000 });
    return canonical;
  } catch (error) {
    console.warn(`[web] canonical slug lookup failed for ${slug}`, error);
    return null;
  }
}

/** 308 /f/<old-slug>/… to the forum's current slug (editable slugs) so
 * bookmarks and sent-email links land on canonical URLs. */
async function staleSlugRedirect(request: NextRequest) {
  const match = FORUM_PATH_RE.exec(request.nextUrl.pathname);
  if (!match) return undefined;
  const requested = decodeURIComponent(match[1] ?? "");
  if (!requested) return undefined;
  const canonical = await lookupCanonicalSlug(requested);
  if (!canonical || canonical === requested) return undefined;
  const url = request.nextUrl.clone();
  url.pathname = `/f/${canonical}${match[2] ?? ""}`;
  return NextResponse.redirect(url, 308);
}

/**
 * vanity-address (Ed, 2026-09-04): a request on any host that isn't ours
 * is REDIRECTED to the deployment's own origin — into the forum whose
 * address (host + longest path prefix) it matches, carrying the rest of
 * the path and the query along, or to the home page when nothing on that
 * host matches. Never served in place: sessions are per host, links are
 * absolute `/f/<slug>/…` paths, and emails link home regardless — and a
 * stray host pointed at us must not render the app under its name. 307,
 * not 308: admins edit these addresses, and browsers cache 308 for good.
 */
async function vanityRedirect(request: NextRequest) {
  const host = requestHost(request);
  if (!isCustomHost(host)) return undefined;

  const routes = await lookupHostRoutes(host);
  const match = matchVanityRoute(routes, request.nextUrl.pathname);
  const url = new URL(env.webOrigin);
  if (match) {
    url.pathname = `/f/${match.slug}${match.rest}`;
    url.search = request.nextUrl.search;
  }
  return NextResponse.redirect(url, 307);
}

/**
 * Route the request AND mint its CSP (audit follow-up 2026-08-17). The
 * nonce travels two ways: the `content-security-policy` REQUEST header is
 * how Next learns to stamp its own framework inline scripts, and `x-nonce`
 * is how the root layout stamps ours (the pre-paint theme script). The
 * response then carries the policy to the browser. Redirect responses
 * skip all of it — no document renders.
 */
async function routeRequest(request: NextRequest) {
  const redirected = await staleSlugRedirect(request);
  if (redirected) return redirected;

  const nonce = mintNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

const clerkProxy = clerkMiddleware(async (_auth, request) => {
  return routeRequest(request);
});

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  // Clerk sessions exist per host, so our www/legacy aliases redirect to the
  // deployment's own origin before anything else runs (issue #230). 308
  // preserves method and query, and calendar/feed clients follow it.
  const target = redirectTargetHost(requestHost(request), env.webOrigin);
  if (target) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = target;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Any other host is a vanity address (or a stray) — redirected home too,
  // before Clerk sees a host it was never configured for.
  const vanity = await vanityRedirect(request);
  if (vanity) return vanity;

  // Playwright smoke tests render anonymous shell routes without Clerk's
  // development-browser handshake or real Clerk credentials.
  if (e2eTestMode) {
    return routeRequest(request);
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?)).*)",
    "/(api|trpc)(.*)",
  ],
};
