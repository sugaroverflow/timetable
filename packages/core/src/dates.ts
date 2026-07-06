/**
 * Raw SQL aggregates (max/min) bypass Drizzle's column mappers, so values
 * typed as Date can arrive as strings at runtime. Coerce before calling any
 * Date method on them.
 */
export function coerceDate(
  value: Date | string | null | undefined,
): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
