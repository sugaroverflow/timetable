/**
 * vanity-address (Ed, 2026-09-04): a forum's short public address —
 * `topic.newspeak.house/2026` — stored in `timetables.customDomain`.
 * Requests arriving there are REDIRECTED to the forum's canonical URL on
 * topic.forum (sign-in is per host, links are absolute `/f/<slug>/…`
 * paths, and emails link to topic.forum regardless — so serving the forum
 * in place would be partial at best). Several forums may share one host
 * with different path prefixes (one per year), and a bare hostname is a
 * prefix of "/".
 *
 * Shared because both sides need the same grammar: the API validates and
 * canonicalises what an admin types, the web proxy matches requests.
 */

/** RFC-shaped hostname: dot-separated LDH labels, no scheme, no port. */
const HOSTNAME =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** URL path segments as people type them on posters — unreserved chars only. */
const SEGMENT = /^[a-z0-9._~-]+$/;

export type VanityAddress = {
  host: string;
  /** "" for a bare hostname; otherwise "/2026" or "/a/b" (leading slash,
   * no trailing slash). */
  pathPrefix: string;
};

/** Parse an admin-typed address into its canonical parts, or null when it
 * isn't one. Tolerates a scheme and a trailing slash; lowercases. */
export function parseVanityAddress(input: string): VanityAddress | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/\/+$/, "");
  if (!s) return null;
  const slash = s.indexOf("/");
  const host = slash === -1 ? s : s.slice(0, slash);
  const path = slash === -1 ? "" : s.slice(slash);
  if (host.length > 253 || !HOSTNAME.test(host)) return null;
  if (path) {
    const segments = path.slice(1).split("/");
    if (segments.some((seg) => !SEGMENT.test(seg))) return null;
  }
  if (host.length + path.length > 253) return null;
  return { host, pathPrefix: path };
}

/** The stored string form: `host` or `host/prefix`. */
export function formatVanityAddress(address: VanityAddress): string {
  return `${address.host}${address.pathPrefix}`;
}

export type VanityRoute = { slug: string; pathPrefix: string };

/** Which forum a request on a vanity host lands in, and the path left
 * over to carry into it. Longest prefix wins on a segment boundary, so
 * `/2026-extra` does not match the `/2026` forum; a bare-host route
 * (prefix "") catches everything the others don't. Null when the host has
 * no route for this path. */
export function matchVanityRoute(
  routes: readonly VanityRoute[],
  pathname: string,
): { slug: string; rest: string } | null {
  let best: VanityRoute | null = null;
  for (const route of routes) {
    const prefix = route.pathPrefix;
    const hit =
      prefix === "" || pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (hit && (best === null || prefix.length > best.pathPrefix.length)) {
      best = route;
    }
  }
  if (!best) return null;
  const rest = pathname.slice(best.pathPrefix.length);
  return { slug: best.slug, rest: rest === "/" ? "" : rest };
}
