const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 31_536_000 },
  { unit: "month", seconds: 2_592_000 },
  { unit: "week", seconds: 604_800 },
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
];

/** "5 minutes ago" / "yesterday" / "2 weeks ago" via the built-in
 * Intl.RelativeTimeFormat — no date library needed. Anything under a
 * minute reads "just now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const { unit, seconds: size } of UNITS) {
    if (abs >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const SHORT: Record<string, string> = {
  year: "y",
  month: "mo",
  week: "w",
  day: "d",
  hour: "h",
  minute: "m",
};

/** The compact form — "9h", "2d", "3w", "now" — for the Lounge's quiet
 * thread (Ed, 2026-10-02), where the time sits in a muted run after the
 * name ("Faculty · 9h"). Past times only; a future one reads "now". */
export function shortRelativeTime(
  iso: string,
  now: number = Date.now(),
): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  for (const { unit, seconds: size } of UNITS) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${SHORT[unit]}`;
  }
  return "now";
}
