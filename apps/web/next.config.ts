import path from "path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @timetable/shared ships TypeScript source; let Next transpile it.
  transpilePackages: ["@timetable/shared"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Forum URLs moved /t/ → /f/ and the browsing page /feed → /topics
  // (2026-07 de-social-media renaming). Old links — including those in
  // already-sent digest/invite emails — redirect permanently. Order
  // matters: the specific feed/topics mappings must precede the blanket
  // prefix redirect. Query strings are preserved automatically.
  async redirects() {
    return [
      {
        source: "/t/:slug/feed",
        destination: "/f/:slug/topics",
        permanent: true,
      },
      {
        source: "/t/:slug/topics",
        destination: "/f/:slug/my-topics",
        permanent: true,
      },
      { source: "/t/:path*", destination: "/f/:path*", permanent: true },
      {
        source: "/f/:slug/feed",
        destination: "/f/:slug/topics",
        permanent: true,
      },
      // Analysis moved off /dashboard (2026-07-27). Old /t/ links reach
      // this via the blanket /t → /f hop first.
      {
        source: "/f/:slug/dashboard",
        destination: "/f/:slug/analysis",
        permanent: true,
      },
    ];
  },
};

export default config;
