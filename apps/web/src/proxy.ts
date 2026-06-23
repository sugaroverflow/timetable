import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

// Next 16 renamed the "middleware" convention to "proxy". Clerk attaches auth
// to every request; route-level access control is enforced in layouts/pages
// (public timetables stay readable while anonymous).
type RouteLookup = {
  data?: { timetableRouteByDomain?: { slug: string } | null };
};

const ROUTE_QUERY = `
  query DomainRoute($host: String!) {
    timetableRouteByDomain(host: $host) { slug }
  }
`;

const routeCache = new Map<string, { slug: string; expiresAt: number }>();

function normalizeHost(host: string | null): string {
  return (host ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function canonicalHosts(): Set<string> {
  const configured = process.env.NEXT_PUBLIC_CANONICAL_HOSTS ?? "";
  return new Set(
    [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "timetable.love",
      "dev.timetable.love",
      ...configured.split(","),
    ]
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
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
  if (pathname.startsWith("/t/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/graphql" || pathname.startsWith("/graphql/")) return false;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return false;
  }
  return true;
}

async function lookupDomainSlug(host: string): Promise<string | null> {
  const now = Date.now();
  const cached = routeCache.get(host);
  if (cached && cached.expiresAt > now) return cached.slug;

  const graphqlUrl =
    process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";

  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ROUTE_QUERY, variables: { host } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RouteLookup;
    const slug = json.data?.timetableRouteByDomain?.slug ?? null;
    if (slug) routeCache.set(host, { slug, expiresAt: now + 60_000 });
    return slug;
  } catch {
    return null;
  }
}

async function customDomainRewrite(request: NextRequest) {
  const host = normalizeHost(request.headers.get("x-forwarded-host")) ||
    normalizeHost(request.headers.get("host"));
  const pathname = request.nextUrl.pathname;
  if (!isCustomHost(host) || !shouldRewritePath(pathname)) return undefined;

  const slug = await lookupDomainSlug(host);
  if (!slug) return undefined;

  const url = request.nextUrl.clone();
  url.pathname = `/t/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export default clerkMiddleware(async (_auth, request) => {
  return customDomainRewrite(request);
});

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?)).*)",
    "/(api|trpc)(.*)",
  ],
};
