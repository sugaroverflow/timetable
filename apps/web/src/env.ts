export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  graphqlUrl:
    process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql",
  // Deployed web + API share one public origin (NEXT_PUBLIC_API_URL is the
  // app's own URL); only local dev splits the ports, hence the :3000 default.
  webOrigin: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  // Extra self-hosts (CSV) beyond the built-in list in lib/canonicalHost.
  canonicalHostsCsv: process.env.NEXT_PUBLIC_CANONICAL_HOSTS ?? "",
};
