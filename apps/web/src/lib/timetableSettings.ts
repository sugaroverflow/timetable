import type { CSSProperties } from "react";

export type RoleLabels = {
  admin?: string;
  host?: string;
  elector?: string;
};

export type TimetableSettings = {
  roleLabels?: RoleLabels;
  theme?: { primary?: string; secondary?: string };
  coverImageUrl?: string | null;
};

export function parseTimetableSettings(raw: string | null | undefined) {
  if (!raw) return {} as TimetableSettings;
  try {
    return JSON.parse(raw) as TimetableSettings;
  } catch {
    return {} as TimetableSettings;
  }
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

export function themeStyle(
  settings: TimetableSettings,
): CSSProperties & { "--primary"?: string; "--primary-soft"?: string } {
  const style: CSSProperties & {
    "--primary"?: string;
    "--primary-soft"?: string;
  } = {};
  if (settings.theme?.primary) style["--primary"] = settings.theme.primary;
  if (settings.theme?.secondary) {
    style["--primary-soft"] = settings.theme.secondary;
  }
  return style;
}
