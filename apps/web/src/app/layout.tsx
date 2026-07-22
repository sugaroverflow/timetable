import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Topic",
  description: "Collaborative forums — topic feeds, voting, and availability.",
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
          href="https://fonts.googleapis.com/css2?family=Poetsen+One&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );

  if (process.env.E2E_TEST_MODE === "1") return content;

  return <ClerkProvider>{content}</ClerkProvider>;
}
