import type { MetadataRoute } from "next";

/**
 * installable-app (#367): the ONE "Topic" app every forum installs as —
 * one manifest at /manifest.webmanifest (app/manifest.ts), one icon set
 * in public/ (scripts/generate-app-icons.mjs draws them from 📚).
 *
 * A manifest is JSON, so it can't read CSS variables: the colours below
 * duplicate their tokens.css values. Change them together.
 */

/** --card (light) — the surface the topbar sits on, so Android's status
 * bar and title bar blend into it. */
export const APP_THEME_COLOR = "#ffffff";
/** --card (dark) — the dark topbar's surface, for the dark theme-color. */
export const APP_THEME_COLOR_DARK = "#1d222c";
/** --bg (light) — the page background, for the launch splash screen. */
export const APP_BACKGROUND_COLOR = "#eceef3";

/** The 180px iOS Home Screen icon. Also at the conventional root path, so
 * iOS finds it even on a page whose metadata omits the link. */
export const APPLE_TOUCH_ICON = "/apple-touch-icon.png";

export const APP_ICONS: MetadataRoute.Manifest["icons"] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  {
    src: "/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

export function appManifest(): MetadataRoute.Manifest {
  return {
    // Stable identity, independent of start_url (from #360).
    id: "/",
    name: "Topic",
    short_name: "Topic",
    description: "Collaborative forums — topics, voting, and availability.",
    lang: "en-GB",
    // The signed-in landing resolver: forwards to the forum you last
    // visited, or to /sign-in when this installed app has no session yet.
    start_url: "/timetables",
    scope: "/",
    display: "standalone",
    theme_color: APP_THEME_COLOR,
    background_color: APP_BACKGROUND_COLOR,
    icons: APP_ICONS,
  };
}
