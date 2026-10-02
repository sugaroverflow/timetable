import { env } from "@/env";

/** Hosts the app itself answers on — everything else is (potentially) a
 * customer's custom forum domain. The aliases stay in this set even though
 * they now redirect: the set also powers the "not a custom domain" check. */
export function canonicalHosts(): Set<string> {
  const configured = env.canonicalHostsCsv;
  return new Set(
    [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "topic.forum",
      "www.topic.forum",
      "timetable.love",
      "www.timetable.love",
      "dev.timetable.love",
      ...configured.split(","),
    ]
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

/** The host to 308-redirect a request to, or null to serve in place.
 *
 * Clerk sessions exist per host, so serving topic.forum, www.*, and the old
 * timetable.love as equals meant an old bookmark landed signed-out (issue
 * #230). Every alias we serve now redirects to the deployment's own origin
 * (NEXT_PUBLIC_API_URL — web and API share it). Customer custom domains and
 * local dev are never redirected.
 */
export function redirectTargetHost(
  host: string,
  webOrigin: string,
): string | null {
  if (!host || LOCAL_HOSTS.has(host)) return null;
  let canonical: string;
  try {
    canonical = new URL(webOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Local dev serves any host as-is (no aliases point at it anyway).
  if (LOCAL_HOSTS.has(canonical)) return null;
  if (host === canonical) return null;
  if (!canonicalHosts().has(host)) return null;
  return canonical;
}
