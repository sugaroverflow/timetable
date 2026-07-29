import type {
  NotificationSettings,
  RoleLabels,
  ThemeSettings,
  TimetableSettings,
} from "@timetable/shared";

/** Settings shapes live in @timetable/shared (single source of truth, shared
 * with the db schema); re-exported here for the web components that import
 * them alongside the theming helpers below. */
export type { RoleLabels, ThemeSettings, TimetableSettings };

/** Web-facing name for the digest preference shape; the canonical type is
 * NotificationSettings in @timetable/shared (also the per-user prefs). */
export type DigestSettings = NotificationSettings;

export function parseTimetableSettings(raw: string | null | undefined) {
  if (!raw) return {} as TimetableSettings;
  try {
    return JSON.parse(raw) as TimetableSettings;
  } catch {
    return {} as TimetableSettings;
  }
}

/** Parse a user's serialized notification prefs; {} on missing/bad JSON. */
export function parseDigestSettings(
  raw: string | null | undefined,
): DigestSettings {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DigestSettings;
  } catch {
    return {};
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

/** One-line plain-English gloss of a privacy level for the sidebar footer
 * (QA 2026-07-27 — replaced the terse pill). Mirrors the actual rules in
 * shared/permissions: comments are public only on `public`; bios follow
 * canSeePersonProfile (everyone on public/no_comments, hosts + admins on
 * hosts_only). Role labels are the forum's own, pluralized. */
export function privacyDescription(
  privacy: string,
  labels: RoleLabels | undefined,
): string {
  const hosts = pluralLabel(roleLabel(labels, "host")).toLowerCase();
  const admins = pluralLabel(roleLabel(labels, "admin")).toLowerCase();
  const config: Record<string, string> = {
    public: "Topics, bios, and comments are public",
    no_comments: "Topics and user bios are public",
    hosts_only: `Topics and ${hosts} bios are public`,
    private: "Forum is only visible to members",
    deactivated: `Forum is only visible to ${admins}`,
  };
  return config[privacy] ?? privacy;
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
  elegant: {
    label: "Playfair Display + Inter",
    serif: '"Playfair Display", Georgia, serif',
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  grotesk: {
    label: "All sans (Space Grotesk)",
    serif: '"Space Grotesk", system-ui, sans-serif',
    sans: '"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  literary: {
    label: "All serif (Fraunces)",
    serif: '"Fraunces", Georgia, serif',
    sans: '"Fraunces", Georgia, serif',
  },
  system: {
    label: "System fonts",
    serif: "ui-serif, Georgia, 'Times New Roman', serif",
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
};

/** Display faces for the forum name in the topbar (2026-07-29) — chosen
 * separately from the reading pairing; keys mirror shared BRAND_FONT_KEYS. */
export const BRAND_FONTS: Record<string, { label: string; stack: string }> = {
  default: {
    label: "Poetsen One (default)",
    stack: '"Poetsen One", "Fraunces", Georgia, serif',
  },
  fraunces: { label: "Fraunces", stack: '"Fraunces", Georgia, serif' },
  playfair: {
    label: "Playfair Display",
    stack: '"Playfair Display", Georgia, serif',
  },
  abril: { label: "Abril Fatface", stack: '"Abril Fatface", Georgia, serif' },
  bebas: { label: "Bebas Neue", stack: '"Bebas Neue", Impact, sans-serif' },
  grotesk: {
    label: "Space Grotesk",
    stack: '"Space Grotesk", system-ui, sans-serif',
  },
  lobster: { label: "Lobster", stack: '"Lobster", cursive' },
  caveat: { label: "Caveat", stack: '"Caveat", cursive' },
  mono: {
    label: "IBM Plex Mono",
    stack: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  },
  sans: { label: "Inter (plain)", stack: '"Inter", system-ui, sans-serif' },
};

/**
 * Built-in theme palettes — the app's default look. These MIRROR the light and
 * dark semantic values in tokens.css (--primary / --bg / --topbar / --ink / …);
 * keep them in sync if those tokens change. Single source of truth for the
 * Settings form's initial state and its Discard baseline.
 */
export const DEFAULT_THEME_LIGHT = {
  primary: "#2f54eb", // --primary (--blue-600)
  secondary: "#5b7bff", // host accent seed (brand blue)
  background: "#eceef3", // --bg
  topbar: "#ffffff", // --card (opaque top bar)
  topbarText: "#1b2330", // --ink
  text: "#1b2330", // --ink
  font: "default",
  brandFont: "default",
} as const;

export const DEFAULT_THEME_DARK = {
  primary: "#2f54eb",
  secondary: "#5b7bff",
  background: "#14171e", // --bg (dark)
  topbar: "#1d222c", // --card (dark)
  topbarText: "#e7eaf1", // --ink (dark)
  text: "#e7eaf1", // --ink (dark)
} as const;

/** One preset palette: fills every light + dark colour field in the
 * Settings form at once (2026-07-29). Purely a form convenience — the
 * individual colours are what's persisted, so admins can tweak after. */
export type PresetPalette = {
  label: string;
  light: {
    primary: string;
    secondary: string;
    background: string;
    topbar: string;
    topbarText: string;
    text: string;
  };
  dark: {
    primary: string;
    secondary: string;
    background: string;
    topbar: string;
    topbarText: string;
    text: string;
  };
};

const preset = (
  label: string,
  light: PresetPalette["light"],
  dark: PresetPalette["dark"],
): PresetPalette => ({ label, light, dark });

export const PRESET_PALETTES: Record<string, PresetPalette> = {
  classic: preset(
    "Classic Blue (default)",
    { ...DEFAULT_THEME_LIGHT },
    { ...DEFAULT_THEME_DARK },
  ),
  forest: preset(
    "Forest",
    {
      primary: "#1f7a4d",
      secondary: "#4f9e75",
      background: "#edf2ee",
      topbar: "#ffffff",
      topbarText: "#1c2a22",
      text: "#1c2a22",
    },
    {
      primary: "#2ea36b",
      secondary: "#5cb890",
      background: "#101815",
      topbar: "#182420",
      topbarText: "#e2ece6",
      text: "#dfe9e3",
    },
  ),
  ocean: preset(
    "Ocean",
    {
      primary: "#0369a1",
      secondary: "#0ea5e9",
      background: "#e9f1f6",
      topbar: "#ffffff",
      topbarText: "#0f2532",
      text: "#132b3a",
    },
    {
      primary: "#38bdf8",
      secondary: "#7dd3fc",
      background: "#0b1620",
      topbar: "#122230",
      topbarText: "#dcedf7",
      text: "#d7e8f2",
    },
  ),
  plum: preset(
    "Plum",
    {
      primary: "#7c3aed",
      secondary: "#a78bfa",
      background: "#f1eef6",
      topbar: "#ffffff",
      topbarText: "#241b38",
      text: "#251d38",
    },
    {
      primary: "#a78bfa",
      secondary: "#c4b5fd",
      background: "#161221",
      topbar: "#201a30",
      topbarText: "#e9e4f5",
      text: "#e6e1f2",
    },
  ),
  crimson: preset(
    "Crimson",
    {
      primary: "#be123c",
      secondary: "#e11d48",
      background: "#f6eeef",
      topbar: "#ffffff",
      topbarText: "#31121a",
      text: "#33151d",
    },
    {
      primary: "#fb7185",
      secondary: "#fda4af",
      background: "#1c1013",
      topbar: "#2a171c",
      topbarText: "#f6dfe4",
      text: "#f2dce1",
    },
  ),
  terracotta: preset(
    "Terracotta",
    {
      primary: "#c2542e",
      secondary: "#e07b54",
      background: "#f5efe9",
      topbar: "#fdf8f3",
      topbarText: "#33201a",
      text: "#33201a",
    },
    {
      primary: "#e07b54",
      secondary: "#f0a583",
      background: "#1a1310",
      topbar: "#271c16",
      topbarText: "#f2e4dc",
      text: "#efe1d9",
    },
  ),
  amber: preset(
    "Amber",
    {
      primary: "#b45309",
      secondary: "#f59e0b",
      background: "#f6f1e7",
      topbar: "#fffbf2",
      topbarText: "#2e2410",
      text: "#2e2512",
    },
    {
      primary: "#fbbf24",
      secondary: "#fcd34d",
      background: "#191510",
      topbar: "#252017",
      topbarText: "#f3ecdd",
      text: "#f0e9da",
    },
  ),
  rose: preset(
    "Rose",
    {
      primary: "#be185d",
      secondary: "#ec4899",
      background: "#f6eef3",
      topbar: "#ffffff",
      topbarText: "#33111f",
      text: "#341422",
    },
    {
      primary: "#f472b6",
      secondary: "#f9a8d4",
      background: "#1c1017",
      topbar: "#2a1720",
      topbarText: "#f6dfe9",
      text: "#f2dce6",
    },
  ),
  teal: preset(
    "Teal",
    {
      primary: "#0f766e",
      secondary: "#14b8a6",
      background: "#ebf2f1",
      topbar: "#ffffff",
      topbarText: "#122a27",
      text: "#132b28",
    },
    {
      primary: "#2dd4bf",
      secondary: "#5eead4",
      background: "#0e1716",
      topbar: "#152321",
      topbarText: "#daece9",
      text: "#d7e9e6",
    },
  ),
  slate: preset(
    "Slate",
    {
      primary: "#475569",
      secondary: "#64748b",
      background: "#eef0f3",
      topbar: "#ffffff",
      topbarText: "#1e2530",
      text: "#1e2530",
    },
    {
      primary: "#94a3b8",
      secondary: "#b6c2d2",
      background: "#131720",
      topbar: "#1c222d",
      topbarText: "#e4e8ee",
      text: "#e1e5eb",
    },
  ),
  midnight: preset(
    "Midnight bar",
    {
      primary: "#4c6ef5",
      secondary: "#748ffc",
      background: "#eceef3",
      topbar: "#101623",
      topbarText: "#f0f3fa",
      text: "#1b2330",
    },
    {
      primary: "#748ffc",
      secondary: "#91a7ff",
      background: "#111521",
      topbar: "#0b0f1a",
      topbarText: "#eef1f8",
      text: "#e6eaf2",
    },
  ),
  noir: preset(
    "Noir",
    {
      primary: "#18181b",
      secondary: "#52525b",
      background: "#f1f1f2",
      topbar: "#ffffff",
      topbarText: "#111113",
      text: "#151517",
    },
    {
      primary: "#e4e4e7",
      secondary: "#a1a1aa",
      background: "#111113",
      topbar: "#1a1a1d",
      topbarText: "#f1f1f2",
      text: "#ececee",
    },
  ),
};

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

/** Accents carry into dark mode (with optional dark overrides): primary
 * drives the accent colours, secondary the host-only panel colours. */
function accentVars(
  theme: ThemeSettings,
  dark: boolean,
): Record<string, string> {
  const vars: Record<string, string> = {};
  const primary = dark ? (theme.dark?.primary ?? theme.primary) : theme.primary;
  const secondary = dark
    ? (theme.dark?.secondary ?? theme.secondary)
    : theme.secondary;
  if (primary) {
    vars["--primary"] = primary;
    vars["--primary-soft"] = withAlpha(primary, "1a");
    vars["--primary-ink"] = readableInk(primary);
  }
  if (secondary) {
    vars["--host-ink"] = secondary;
    vars["--host-wash"] = withAlpha(secondary, "15");
    vars["--host-line"] = withAlpha(secondary, "40");
  }
  return vars;
}

/** Base colours (background/topbar/text) apply in dark mode only when a dark
 * override is set — light values would wreck the built-in dark palette. */
function baseVars(theme: ThemeSettings, dark: boolean): Record<string, string> {
  const source = (dark ? theme.dark : theme) ?? {};
  const vars: Record<string, string> = {};
  if (source.background) vars["--bg"] = source.background;
  if (source.topbar) vars["--topbar"] = source.topbar;
  if (source.topbarText) vars["--topbar-ink"] = source.topbarText;
  if (source.text) vars["--ink"] = source.text;
  return vars;
}

function fontVars(theme: ThemeSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  const font = theme.font ? FONT_PAIRINGS[theme.font] : undefined;
  if (font) {
    vars["--serif"] = font.serif;
    vars["--sans"] = font.sans;
  }
  const brand = theme.brandFont ? BRAND_FONTS[theme.brandFont] : undefined;
  if (brand) vars["--brand-display"] = brand.stack;
  return vars;
}

/**
 * The single theme→CSS-variable mapping, used for both server render
 * (buildThemeCss) and the settings page's live preview. Composed from the
 * accent/base/font helpers above; the spread order fixes the emitted key
 * order, which buildThemeCss serializes verbatim.
 */
export function themeVars(
  theme: ThemeSettings | undefined,
  mode: "light" | "dark" = "light",
): Record<string, string> {
  if (!theme) return {};
  const dark = mode === "dark";
  return {
    ...accentVars(theme, dark),
    ...baseVars(theme, dark),
    ...fontVars(theme),
  };
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
