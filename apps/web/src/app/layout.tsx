import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import "./tokens.css";
import "./globals.css";

import { env } from "@/env";
import { emojiFavicon } from "@/lib/favicon";

export const metadata: Metadata = {
  // Absolute base for og:image and other metadata URLs — without it Next
  // falls back to localhost and scrapers can't fetch the social cards.
  metadataBase: new URL(env.webOrigin),
  title: "Topic",
  description: "Collaborative forums — topics, voting, and availability.",
  // Config-based (not app/icon.tsx) so forum layouts can override the
  // favicon with the forum's own icon — file-convention icons always win
  // over nested metadata.
  icons: { icon: emojiFavicon("📚") },
};

// Clerk's prebuilt UI (sign-in/sign-up cards, the account modal) themed to
// the app's tokens — CSS-variable values track per-forum themes and
// light/dark automatically. The modal's own "Profile" (name/photo) section
// is hidden: identity lives in per-forum Topic profiles, and Clerk's copy
// is only mirrored once at first sign-in, so edits there change nothing in
// the app and it read as a confusing second profile (QA 2026-08-10).
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-ink)",
    colorBackground: "var(--card)",
    colorForeground: "var(--ink)",
    colorMutedForeground: "var(--muted)",
    colorNeutral: "var(--ink)",
    colorInput: "var(--card)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--line)",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--sans)",
  },
  elements: {
    profileSection__profile: { display: "none" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Applies the stored light/dark choice before paint — no flash.
  const themeScript = `(function(){try{var m=localStorage.getItem("theme-mode");var d=m==="dark"||((!m||m==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

  const content = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poetsen+One&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Playfair+Display:wght@500;600&family=Space+Grotesk:wght@400;500;600&family=Abril+Fatface&family=Bebas+Neue&family=Lobster&family=Caveat:wght@600&family=Lato:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );

  if (process.env.E2E_TEST_MODE === "1") return content;

  return <ClerkProvider appearance={clerkAppearance}>{content}</ClerkProvider>;
}
