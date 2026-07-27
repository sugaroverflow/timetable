/** Full local timestamp for tooltips on relative-time cells. */
export function formatExactTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Short en-GB date ("3 Jul", or "3 Jul 24" with `year`) for compact UI
 * like pills and table cells. */
export function formatShortDate(
  iso: string,
  opts?: { year?: boolean },
): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(opts?.year ? { year: "2-digit" as const } : {}),
  });
}
