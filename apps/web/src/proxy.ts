import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

import { e2eTestMode, env } from "@/env";
import { canonicalHosts, redirectTargetHost } from "@/lib/canonicalHost";

// Next 16 renamed the "middleware" convention to "proxy". Clerk attaches auth
// to every request; route-level access control is enforced in layouts/pages
// (public timetables stay readable while anonymous).
type RouteLookup = {
  data?: { timetableRouteByDomain?: { slug: string } | null };
  errors?: { message?: string }[];
};

const ROUTE_QUERY = `
  query DomainRoute($host: String!) {
    timetableRouteByDomain: forumRouteByDomain(host: $host) { slug }
  }
`;

const routeCache = new Map<string, { slug: string; expiresAt: number }>();

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

function shouldRewritePath(pathname: string): boolean {
  if (pathname.startsWith("/f/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/graphql" || pathname.startsWith("/graphql/")) return false;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return false;
  }
  return true;
}

/** One GraphQL round-trip: host → timetable slug (null when unrouted).
 * Network and GraphQL failures are logged by name and resolve to null. */
async function fetchDomainSlug(
  host: string,
  graphqlUrl: string,
): Promise<string | null> {
  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ROUTE_QUERY, variables: { host } }),
  });
  if (!res.ok) {
    console.warn(
      `[web] custom domain lookup failed for ${host}: GraphQL returned ${res.status}`,
    );
    return null;
  }
  const json = (await res.json()) as RouteLookup;
  if (json.errors?.length) {
    console.warn(
      `[web] custom domain lookup failed for ${host}: ${json.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ")}`,
    );
    return null;
  }
  return json.data?.timetableRouteByDomain?.slug ?? null;
}

function routeGraphqlUrl(): string {
  return (
    process.env.GRAPHQL_ROUTE_URL ??
    process.env.NEXT_PUBLIC_GRAPHQL_URL ??
    "http://localhost:4000/graphql"
  );
}

async function lookupDomainSlug(host: string): Promise<string | null> {
  const now = Date.now();
  const cached = routeCache.get(host);
  if (cached && cached.expiresAt > now) return cached.slug;

  try {
    const slug = await fetchDomainSlug(host, routeGraphqlUrl());
    if (slug) routeCache.set(host, { slug, expiresAt: now + 60_000 });
    return slug;
  } catch (error) {
    console.warn(`[web] custom domain lookup failed for ${host}`, error);
    return null;
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

async function customDomainRewrite(request: NextRequest) {
  const host = requestHost(request);
  const pathname = request.nextUrl.pathname;
  if (!isCustomHost(host) || !shouldRewritePath(pathname)) return undefined;

  const slug = await lookupDomainSlug(host);
  if (!slug) return undefined;

  const url = request.nextUrl.clone();
  url.pathname = `/f/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

async function routeRequest(request: NextRequest) {
  return (await staleSlugRedirect(request)) ?? customDomainRewrite(request);
}

const clerkProxy = clerkMiddleware(async (_auth, request) => {
  return routeRequest(request);
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
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
