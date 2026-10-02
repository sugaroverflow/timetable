/**
 * Slot-creation planning (slot locations, 2026-08-11). A slot is unique per
 * (forum, start, end); locations are a set ON the slot. Creating slots
 * therefore AGGREGATES: an input whose time window already has a slot adds
 * its locations to that slot instead of duplicating it, and an exact
 * (time, location) duplicate is a no-op. Pure — the DB writes live in
 * @timetable/core's createSlots.
 */

export type PlanSlotInput = {
  startsAt: Date;
  endsAt: Date;
  cellKey?: string | null;
  locations?: string[];
};

export type PlanExistingSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  cellKey: string | null;
  locations: string[];
};

export type SlotPlan = {
  /** Genuinely new time windows, in-payload duplicates merged. */
  toInsert: {
    startsAt: Date;
    endsAt: Date;
    cellKey: string | null;
    locations: string[];
  }[];
  /** Existing slots that gain locations (aggregation), new entries only. */
  locationAdds: { slotId: string; add: string[] }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function timeKey(s: { startsAt: Date; endsAt: Date }): string {
  return `${s.startsAt.getTime()}|${s.endsAt.getTime()}`;
}

function union(base: string[], extra: string[]): string[] {
  const merged = [...base];
  for (const item of extra) if (!merged.includes(item)) merged.push(item);
  return merged;
}

/** The existing slot an input lands on: exact time window first, then the
 * same-cell-within-24h window (DST wobble — generation runs on the admin's
 * browser clock, so one cell×date can yield different UTC instants;
 * same-cell slots are ≥7 days apart by construction, QA 2026-08-05). */
function findMatch(
  byTime: Map<string, PlanExistingSlot>,
  byCell: Map<string, PlanExistingSlot[]>,
  input: PlanSlotInput,
): PlanExistingSlot | undefined {
  const exact = byTime.get(timeKey(input));
  if (exact || !input.cellKey) return exact;
  return byCell
    .get(input.cellKey)
    ?.find(
      (s) => Math.abs(s.startsAt.getTime() - input.startsAt.getTime()) < DAY_MS,
    );
}

/**
 * Match inputs against existing slots — matches become location additions,
 * the rest becomes inserts, deduped within the payload.
 */
export function planSlotCreation(
  existing: PlanExistingSlot[],
  inputs: PlanSlotInput[],
): SlotPlan {
  const byTime = new Map(existing.map((s) => [timeKey(s), s]));
  const byCell = new Map<string, PlanExistingSlot[]>();
  for (const s of existing) {
    if (!s.cellKey) continue;
    byCell.set(s.cellKey, [...(byCell.get(s.cellKey) ?? []), s]);
  }

  const adds = new Map<string, string[]>();
  const inserts = new Map<
    string,
    {
      startsAt: Date;
      endsAt: Date;
      cellKey: string | null;
      locations: string[];
    }
  >();

  for (const input of inputs) {
    const locations = input.locations ?? [];
    const match = findMatch(byTime, byCell, input);
    if (match) {
      const pending = adds.get(match.id) ?? [];
      const fresh = locations.filter(
        (l) => !match.locations.includes(l) && !pending.includes(l),
      );
      if (fresh.length > 0) adds.set(match.id, [...pending, ...fresh]);
      continue;
    }
    const key = timeKey(input);
    const pending = inserts.get(key);
    if (pending) {
      pending.locations = union(pending.locations, locations);
      continue;
    }
    inserts.set(key, {
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      cellKey: input.cellKey ?? null,
      locations,
    });
  }

  return {
    toInsert: [...inserts.values()],
    locationAdds: [...adds.entries()].map(([slotId, add]) => ({ slotId, add })),
  };
}
