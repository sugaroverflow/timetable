import path from "path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @timetable/shared ships TypeScript source; let Next transpile it.
  transpilePackages: ["@timetable/shared"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Baseline security headers (audit 2026-08-17). No CSP yet — the theme
  // <style> and the pre-hydration theme <script> are inline, so a real CSP
  // needs nonce propagation through the proxy; tracked separately.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app offers no legitimate embedding; authenticated pages
          // (settings, admin) must not be frameable.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Ignored over plain http (local dev); binding on the hosted
          // https origins.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
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
      // Admin pages renamed (2026-07-29): /moderation → /pending,
      // /activity → /log. Notification emails and bookmarks link the old
      // paths — never remove.
      {
        source: "/f/:slug/moderation",
        destination: "/f/:slug/pending",
        permanent: true,
      },
      {
        source: "/f/:slug/activity",
        destination: "/f/:slug/log",
        permanent: true,
      },
    ];
  },
};

export default config;
