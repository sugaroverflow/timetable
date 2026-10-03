import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import "./tokens.css";
import "./globals.css";

import { e2eTestMode, env } from "@/env";
import {
  APP_THEME_COLOR,
  APP_THEME_COLOR_DARK,
  APPLE_TOUCH_ICON,
} from "@/lib/appManifest";
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
  // `apple` is the iOS Home Screen icon (installable-app, #367); forum
  // layouts that override `icon` must carry it along.
  icons: { icon: emojiFavicon("📚"), apple: APPLE_TOUCH_ICON },
  // installable-app (#367): iOS reads these when someone adds Topic to the
  // Home Screen. Next emits `mobile-web-app-capable` for `capable`; the
  // apple- spelling is added below for iOS before 16.4, which predates
  // reading `display: standalone` from the manifest. "default" keeps the
  // status bar opaque with dark text — "black-translucent" would draw the
  // page under white status-bar text, unreadable on the light topbar.
  appleWebApp: { capable: true, title: "Topic", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

// viewport-fit=cover lets the installed app use the whole screen; the
// topbar, page gutters, drawer and toasts pad themselves by
// env(safe-area-inset-*) in globals.css. Zoom stays untouched — never add
// maximumScale/userScalable. theme-color matches the topbar's surface in
// each scheme (the manifest carries the light one).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: APP_THEME_COLOR_DARK },
  ],
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Applies the stored light/dark choice before paint — no flash.
  const themeScript = `(function(){try{var m=localStorage.getItem("theme-mode");var d=m==="dark"||((!m||m==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
  // The proxy's per-request CSP nonce — without it the script above is
  // exactly what the policy exists to block (lib/csp.ts).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const content = (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
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

  if (e2eTestMode) return content;

  // The nonce rides into Clerk's own injected <script> tags: under the
  // CSP's strict-dynamic, host allowlisting is off, so without it Clerk's
  // clerk.browser.js is blocked (caught live on dev, 2026-08-17 — the
  // local probe couldn't see it because E2E mode skips Clerk entirely).
  return (
    <ClerkProvider appearance={clerkAppearance} nonce={nonce} dynamic>
      {content}
    </ClerkProvider>
  );
}
