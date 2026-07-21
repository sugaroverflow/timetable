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
};

/** Per-timetable theme (QA #59 full theming). All colours are #rrggbb.
 * `dark` overrides apply when the viewer uses dark mode; unset dark values
 * fall back to the built-in dark palette. `font` picks a curated pairing. */
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

/** Per-timetable settings persisted as JSON: custom role labels, theme
 * colors, default digest options, etc. */
export type TimetableSettings = {
  roleLabels?: RoleLabels;
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  /** Small square icon shown in the topbar timetable menu. */
  iconUrl?: string | null;
  /** Emoji shown as the icon instead of an uploaded image (takes precedence). */
  iconEmoji?: string | null;
  /** Digest settings seeded onto new members who haven't customized theirs. */
  digestDefaults?: NotificationSettings;
};
