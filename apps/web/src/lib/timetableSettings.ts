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

export type TimetableSettings = {
  roleLabels?: RoleLabels;
  theme?: { primary?: string; secondary?: string };
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

/**
 * The single theme→CSS-variable mapping, used for both server render
 * (themeStyle) and the settings page's live preview. Primary drives the
 * accent colours; secondary drives the host-only panel colours.
 */
export function themeVars(
  primary: string | undefined,
  secondary: string | undefined,
): Record<string, string> {
  const vars: Record<string, string> = {};
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
  return vars;
}

export function themeStyle(settings: TimetableSettings): CSSProperties {
  return themeVars(
    settings.theme?.primary,
    settings.theme?.secondary,
  ) as CSSProperties;
}
