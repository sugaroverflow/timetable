import { describe, expect, it } from "vitest";

import { planSlotCreation, type PlanExistingSlot } from "./slotPlan";

const at = (iso: string) => new Date(iso);

function slot(
  id: string,
  start: string,
  end: string,
  locations: string[],
  cellKey: string | null = null,
): PlanExistingSlot {
  return { id, startsAt: at(start), endsAt: at(end), cellKey, locations };
}

const TUE_7PM = "2026-09-01T19:00:00.000Z";
const TUE_9PM = "2026-09-01T21:00:00.000Z";

describe("planSlotCreation", () => {
  it("inserts a new time window with its locations", () => {
    const plan = planSlotCreation(
      [],
      [{ startsAt: at(TUE_7PM), endsAt: at(TUE_9PM), locations: ["Hall"] }],
    );
    expect(plan.toInsert).toEqual([
      {
        startsAt: at(TUE_7PM),
        endsAt: at(TUE_9PM),
        cellKey: null,
        locations: ["Hall"],
      },
    ]);
    expect(plan.locationAdds).toEqual([]);
  });

  it("aggregates a same-time input into the existing slot's locations", () => {
    const plan = planSlotCreation(
      [slot("s1", TUE_7PM, TUE_9PM, ["Classroom"])],
      [{ startsAt: at(TUE_7PM), endsAt: at(TUE_9PM), locations: ["Hall"] }],
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.locationAdds).toEqual([{ slotId: "s1", add: ["Hall"] }]);
  });

  it("treats an exact (time, location) duplicate as a no-op", () => {
    const plan = planSlotCreation(
      [slot("s1", TUE_7PM, TUE_9PM, ["Classroom"])],
      [
        {
          startsAt: at(TUE_7PM),
          endsAt: at(TUE_9PM),
          locations: ["Classroom"],
        },
      ],
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.locationAdds).toEqual([]);
  });

  it("merges in-payload duplicates of the same window into one insert", () => {
    const plan = planSlotCreation(
      [],
      [
        {
          startsAt: at(TUE_7PM),
          endsAt: at(TUE_9PM),
          locations: ["Classroom"],
        },
        { startsAt: at(TUE_7PM), endsAt: at(TUE_9PM), locations: ["Hall"] },
        { startsAt: at(TUE_7PM), endsAt: at(TUE_9PM), locations: ["Hall"] },
      ],
    );
    expect(plan.toInsert).toEqual([
      {
        startsAt: at(TUE_7PM),
        endsAt: at(TUE_9PM),
        cellKey: null,
        locations: ["Classroom", "Hall"],
      },
    ]);
  });

  it("merges locations into a same-cell slot within the 24h DST wobble", () => {
    // Same pattern cell, one hour off (a DST-shifted regeneration).
    const plan = planSlotCreation(
      [slot("s1", TUE_7PM, TUE_9PM, ["Classroom"], "2-19:00")],
      [
        {
          startsAt: at("2026-09-01T18:00:00.000Z"),
          endsAt: at("2026-09-01T20:00:00.000Z"),
          cellKey: "2-19:00",
          locations: ["Hall"],
        },
      ],
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.locationAdds).toEqual([{ slotId: "s1", add: ["Hall"] }]);
  });

  it("does not wobble-match a hand-created input without a cellKey", () => {
    const plan = planSlotCreation(
      [slot("s1", TUE_7PM, TUE_9PM, ["Classroom"], "2-19:00")],
      [
        {
          startsAt: at("2026-09-01T18:00:00.000Z"),
          endsAt: at("2026-09-01T20:00:00.000Z"),
          locations: ["Hall"],
        },
      ],
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.locationAdds).toEqual([]);
  });

  it("handles location-free forums (no locations anywhere)", () => {
    const plan = planSlotCreation(
      [slot("s1", TUE_7PM, TUE_9PM, [])],
      [
        { startsAt: at(TUE_7PM), endsAt: at(TUE_9PM) },
        {
          startsAt: at("2026-09-08T19:00:00.000Z"),
          endsAt: at("2026-09-08T21:00:00.000Z"),
        },
      ],
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0]!.locations).toEqual([]);
    expect(plan.locationAdds).toEqual([]);
  });
});
