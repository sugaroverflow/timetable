import type { CalendarSlot } from "./calendarTypes";

/** A slot with something happening in it — a topic session, office hours,
 * or an admin's custom event. */
export function hasSession(slot: CalendarSlot): boolean {
  return Boolean(slot.topic || slot.sessionHost || slot.customTitle);
}

/** One calendar row: a single slot, or several OPEN slots sharing the same
 * start/end (same time, different locations) collapsed together. */
export type CalendarRowGroup = { slots: CalendarSlot[]; past: boolean };

/**
 * Collapse open same-time slots into one row (multi-location grouping,
 * 2026-08-06): an open timeslot offered in three rooms is one question —
 * "can you do Tuesday 7pm?" — not three rows. Slots carrying a session
 * stay solo (each session is its own row by design). Group members are
 * location-sorted; the first is the representative the row renders
 * (washes, avatars, discussion) and new availability answers fan out to
 * every member, so members converge.
 */
export function groupCalendarRows(
  rows: { slot: CalendarSlot; past: boolean }[],
): CalendarRowGroup[] {
  const groups: CalendarRowGroup[] = [];
  const openByTime = new Map<string, CalendarRowGroup>();
  for (const { slot, past } of rows) {
    if (hasSession(slot)) {
      groups.push({ slots: [slot], past });
      continue;
    }
    const key = `${slot.startsAt}|${slot.endsAt}`;
    const group = openByTime.get(key);
    if (group) {
      group.slots.push(slot);
    } else {
      const fresh = { slots: [slot], past };
      openByTime.set(key, fresh);
      groups.push(fresh);
    }
  }
  for (const group of groups) {
    group.slots.sort((a, b) => a.location.localeCompare(b.location));
  }
  return groups;
}

/** "Room A, Room B" — the group's distinct locations for the row line. */
export function groupLocations(slots: CalendarSlot[]): string {
  return [...new Set(slots.map((s) => s.location).filter(Boolean))].join(", ");
}
