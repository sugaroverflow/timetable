/**
 * E2E_TEST_MODE=1 renders auth-free shells for the Playwright suite by
 * disabling Clerk entirely (proxy, provider, sign-in pages). That makes it
 * a one-variable auth kill switch, so a production build refuses to boot
 * with it set (audit 2026-08-17). Playwright runs `next dev`, so the
 * guard never fires for the suite; hosted dev is a production build and
 * must never set it.
 */
export const e2eTestMode = process.env.E2E_TEST_MODE === "1";
if (e2eTestMode && process.env.NODE_ENV === "production") {
  throw new Error(
    "[web] E2E_TEST_MODE=1 disables authentication and must never be set on a production build",
  );
}

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  graphqlUrl:
    process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql",
  // Deployed web + API share one public origin (NEXT_PUBLIC_API_URL is the
  // app's own URL); only local dev splits the ports, hence the :3000 default.
  webOrigin: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  // Extra self-hosts (CSV) beyond the built-in list in lib/canonicalHost.
  canonicalHostsCsv: process.env.NEXT_PUBLIC_CANONICAL_HOSTS ?? "",
  // The CSP builder decodes the Clerk frontend-API origin out of this
  // (lib/csp.ts); the Clerk SDK reads the variable itself directly.
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
};
