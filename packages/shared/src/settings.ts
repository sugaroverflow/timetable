/**
 * Settings shapes persisted as JSON by @timetable/db and rendered by the web
 * app. Single source of truth — db's jsonb columns and web's parsing/theming
 * helpers both import from here (the web copy used to be a hand-kept mirror).
 */

/** Custom display labels for the built-in roles. */
export type RoleLabels = {
  admin?: string;
  host?: string;
  elector?: string;
};

/** Per-user digest/notification preferences. Also used as per-timetable
 * digest defaults seeded onto new members who haven't customized theirs. */
export type NotificationSettings = {
  digestNewTopics?: boolean;
  digestReplies?: boolean;
  digestActivity?: boolean;
  /** Sysadmins only: email when any new forum is created. */
  newForumEmails?: boolean;
};

/** Canonical font-pairing keys (QA #59; expanded 2026-07-29). The API
 * validates against this list; the web app maps each key to label + CSS
 * stacks. One list so the two can't drift. */
export const THEME_FONT_KEYS = [
  "default",
  "editorial",
  "humanist",
  "modern",
  "technical",
  "elegant",
  "grotesk",
  "literary",
  "system",
] as const;

/** Canonical brand-font keys (2026-07-29): the display face for the forum
 * name in the topbar, independent of the reading-font pairing. */
export const BRAND_FONT_KEYS = [
  "default",
  "fraunces",
  "playfair",
  "abril",
  "bebas",
  "grotesk",
  "lobster",
  "caveat",
  "mono",
  "sans",
] as const;

/** Per-timetable theme (QA #59 full theming). All colours are #rrggbb.
 * `dark` overrides apply when the viewer uses dark mode; unset dark values
 * fall back to the built-in dark palette. `font` picks a curated pairing;
 * `brandFont` sets the topbar forum-name face separately. */
export type ThemeSettings = {
  primary?: string;
  secondary?: string;
  background?: string;
  topbar?: string;
  topbarText?: string;
  text?: string;
  font?: string;
  brandFont?: string;
  dark?: {
    primary?: string;
    secondary?: string;
    background?: string;
    topbar?: string;
    topbarText?: string;
    text?: string;
  };
};

/** Per-timetable settings persisted as JSON: custom role labels, theme
 * colors, default digest options, etc. */
export type TimetableSettings = {
  roleLabels?: RoleLabels;
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  /** Small square icon shown in the topbar timetable menu. */
  iconUrl?: string | null;
  /** Optional dark-mode alternative for iconUrl (2026-07-29) — shown when
   * the viewer's resolved theme is dark; falls back to iconUrl unset. */
  iconDarkUrl?: string | null;
  /** Emoji shown as the icon instead of an uploaded image (takes precedence). */
  iconEmoji?: string | null;
  /** Digest settings seeded onto new members who haven't customized theirs. */
  digestDefaults?: NotificationSettings;
};
