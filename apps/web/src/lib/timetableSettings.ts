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
  text?: string;
  font?: string;
  dark?: {
    primary?: string;
    secondary?: string;
    background?: string;
    topbar?: string;
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
  const text = dark ? theme.dark?.text : theme.text;
  if (primary) {
    vars["--primary"] = primary;
    vars["--primary-soft"] = primary + "1a";
    vars["--primary-ink"] = "#ffffff";
  }
  if (secondary) {
    vars["--host-ink"] = secondary;
    vars["--host-wash"] = secondary + "15";
    vars["--host-line"] = secondary + "40";
  }
  if (background) vars["--bg"] = background;
  if (topbar) vars["--topbar"] = topbar;
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
