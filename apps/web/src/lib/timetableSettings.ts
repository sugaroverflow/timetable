import type { CSSProperties } from "react";

export type RoleLabels = {
  admin?: string;
  host?: string;
  elector?: string;
};

/** Mirrors NotificationSettings in @timetable/db (web doesn't depend on db). */
export type DigestSettings = {
  digestNewTopics?: boolean;
  digestReplies?: boolean;
  digestActivity?: boolean;
};

/** Mirrors ThemeSettings in @timetable/db. */
export type ThemeSettings = {
  primary?: string;
  secondary?: string;
  background?: string;
  topbar?: string;
  topbarText?: string;
  text?: string;
  font?: string;
  dark?: {
    primary?: string;
    secondary?: string;
    background?: string;
    topbar?: string;
    topbarText?: string;
    text?: string;
  };
};

export type TimetableSettings = {
  roleLabels?: RoleLabels;
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  iconUrl?: string | null;
  digestDefaults?: DigestSettings;
};

export function parseTimetableSettings(raw: string | null | undefined) {
  if (!raw) return {} as TimetableSettings;
  try {
    return JSON.parse(raw) as TimetableSettings;
  } catch {
    return {} as TimetableSettings;
  }
}

/** Privacy → sidebar pill colour/label, shared by the timetable shell and
 * the sidebar switcher. */
export function privacyBadge(privacy: string): { dot: string; label: string } {
  const config: Record<string, { dot: string; label: string }> = {
    public: { dot: "var(--green)", label: "Public" },
    hosts_only: { dot: "var(--green)", label: "Hosts only" },
    no_comments: { dot: "var(--green)", label: "No comments" },
    private: { dot: "var(--yellow)", label: "Private" },
    deactivated: { dot: "var(--faint)", label: "Deactivated" },
  };
  return config[privacy] ?? { dot: "var(--faint)", label: privacy };
}

/** Naive plural for role labels: collective nouns like "Faculty" (and
 * labels already ending in s) stay as-is, everything else gets an "s". */
export function pluralLabel(label: string): string {
  return /[sxy]$/i.test(label) ? label : `${label}s`;
}

export function roleLabel(
  labels: RoleLabels | undefined,
  role: string,
): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return labels?.admin ?? "Admin";
  if (role === "host") return labels?.host ?? "Host";
  if (role === "elector") return labels?.elector ?? "Elector";
  return role;
}

/** Curated font pairings (QA #59). Keys are persisted in settings; values
 * feed --serif (headings) and --sans (body). All stacks resolve to fonts the
 * app already loads or system fonts, so switching costs nothing. */
export const FONT_PAIRINGS: Record<
  string,
  { label: string; serif: string; sans: string }
> = {
  default: {
    label: "Fraunces + Inter (default)",
    serif: '"Fraunces", Georgia, serif',
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  editorial: {
    label: "Georgia + Helvetica",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  humanist: {
    label: "Palatino + Verdana",
    serif: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif",
    sans: "Verdana, Geneva, sans-serif",
  },
  modern: {
    label: "All sans (Inter)",
    serif: '"Inter", system-ui, sans-serif',
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  technical: {
    label: "Monospace headings (IBM Plex Mono)",
    serif: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
};

/**
 * Built-in theme palettes — the app's default look. These MIRROR the light and
 * dark semantic values in tokens.css (--primary / --bg / --topbar / --ink / …);
 * keep them in sync if those tokens change. Single source of truth for the
 * Settings form's initial state and its Discard baseline.
 */
export const DEFAULT_THEME_LIGHT = {
  primary: "#2f54eb", // --primary (--blue-600)
  secondary: "#5b7bff", // host accent seed (--blue-500)
  background: "#eceef3", // --bg
  topbar: "#ffffff", // --card (opaque top bar)
  topbarText: "#1b2330", // --ink
  text: "#1b2330", // --ink
  font: "default",
} as const;

export const DEFAULT_THEME_DARK = {
  primary: "#2f54eb",
  secondary: "#5b7bff",
  background: "#14171e", // --bg (dark)
  topbar: "#1d222c", // --card (dark)
  topbarText: "#e7eaf1", // --ink (dark)
  text: "#e7eaf1", // --ink (dark)
} as const;

/** Pick legible ink for text on a solid `hex` background: white on dark
 * colours, dark ink (#1b2330) on light ones, via WCAG relative luminance. The
 * crossover sits near L≈0.21 (the contrast break-even against #1b2330, above
 * the naive 0.5 midpoint) so light/gold primaries like #f3a712 get dark text
 * instead of invisible white. Falls back to white when `hex` isn't a clean
 * 6-digit value. */
function readableInk(hex: string): "#ffffff" | "#1b2330" {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return L > 0.21 ? "#1b2330" : "#ffffff";
}

/** Append an 8-bit alpha suffix to a solid #rrggbb (→ #rrggbbaa), but only when
 * `hex` is a clean 6-digit value — otherwise return it unchanged so we never
 * emit a broken colour like "var(--x)1a". */
function withAlpha(hex: string, aa: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + aa : hex;
}

/**
 * The single theme→CSS-variable mapping, used for both server render
 * (buildThemeCss) and the settings page's live preview. Primary drives the
 * accent colours; secondary drives the host-only panel colours; background,
 * topbar, and text override the base tokens.
 */
export function themeVars(
  theme: ThemeSettings | undefined,
  mode: "light" | "dark" = "light",
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!theme) return vars;
  const dark = mode === "dark";
  // Accents carry into dark mode (with optional dark overrides); base
  // colours (background/topbar/text) apply in dark mode only when a dark
  // override is set — light values would wreck the built-in dark palette.
  const primary = dark ? (theme.dark?.primary ?? theme.primary) : theme.primary;
  const secondary = dark
    ? (theme.dark?.secondary ?? theme.secondary)
    : theme.secondary;
  const background = dark ? theme.dark?.background : theme.background;
  const topbar = dark ? theme.dark?.topbar : theme.topbar;
  const topbarText = dark ? theme.dark?.topbarText : theme.topbarText;
  const text = dark ? theme.dark?.text : theme.text;
  if (primary) {
    vars["--primary"] = primary;
    vars["--primary-soft"] = withAlpha(primary, "1a");
    vars["--primary-ink"] = readableInk(primary);
  }
  if (secondary) {
    vars["--host-ink"] = secondary;
    vars["--host-wash"] = withAlpha(secondary, "15");
    vars["--host-line"] = withAlpha(secondary, "40");
    // Insight-bar track/chip fills + gradient end, so themed coverage/voter
    // bars pick up the timetable's accent (mirrors --host-track / --host-chip /
    // --host-accent-2 in tokens.css).
    vars["--host-track"] = withAlpha(secondary, "22");
    vars["--host-chip"] = withAlpha(secondary, "22");
    vars["--host-accent-2"] = secondary;
  }
  if (background) vars["--bg"] = background;
  if (topbar) vars["--topbar"] = topbar;
  if (topbarText) vars["--topbar-ink"] = topbarText;
  if (text) vars["--ink"] = text;
  const font = theme.font ? FONT_PAIRINGS[theme.font] : undefined;
  if (font) {
    vars["--serif"] = font.serif;
    vars["--sans"] = font.sans;
  }
  return vars;
}

function cssBlock(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return body ? `${selector}{${body}}` : "";
}

/** Server-rendered <style> content applying a timetable's theme globally
 * (topbar included), with dark-mode overrides under html[data-theme]. */
export function buildThemeCss(settings: TimetableSettings): string {
  return (
    cssBlock(":root", themeVars(settings.theme, "light")) +
    cssBlock('html[data-theme="dark"]', themeVars(settings.theme, "dark"))
  );
}

export function themeStyle(settings: TimetableSettings): CSSProperties {
  return themeVars(settings.theme, "light") as CSSProperties;
}
