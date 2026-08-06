import { describe, expect, it } from "vitest";

import {
  groupCalendarRows,
  groupLocations,
  hasSession,
} from "./calendarGrouping";
import type { CalendarSlot } from "./calendarTypes";

let seq = 0;

function slot(patch: Partial<CalendarSlot> = {}): CalendarSlot {
  seq += 1;
  return {
    id: `slot-${seq}`,
    startsAt: "2026-10-09T14:00:00.000Z",
    endsAt: "2026-10-09T16:00:00.000Z",
    location: "",
    status: "empty",
    url: "",
    cellKey: null,
    topic: null,
    sessionHost: null,
    customTitle: "",
    viewerState: null,
    counts: { green: 0, yellow: 0, red: 0 },
    perUser: null,
    commentCount: 0,
    ...patch,
  };
}

const topic = {
  id: "t1",
  title: "Yoga",
  topicSlug: null,
  hostId: "h1",
  hostName: "Hannah",
};

describe("hasSession", () => {
  it("counts topics, office hours, and custom titles as sessions", () => {
    expect(hasSession(slot())).toBe(false);
    expect(hasSession(slot({ topic }))).toBe(true);
    expect(hasSession(slot({ sessionHost: { id: "h1", name: "H" } }))).toBe(
      true,
    );
    expect(hasSession(slot({ customTitle: "Seminar" }))).toBe(true);
  });
});

describe("groupCalendarRows", () => {
  it("collapses open same-time slots into one location-sorted group", () => {
    const a = slot({ location: "Room B" });
    const b = slot({ location: "Room A" });
    const groups = groupCalendarRows([
      { slot: a, past: false },
      { slot: b, past: false },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.slots.map((s) => s.location)).toEqual([
      "Room A",
      "Room B",
    ]);
  });

  it("keeps slots with sessions solo, even at the same time", () => {
    const open = slot({ location: "Room A" });
    const booked = slot({ location: "Room B", topic, status: "confirmed" });
    const groups = groupCalendarRows([
      { slot: open, past: false },
      { slot: booked, past: false },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.slots.length === 1)).toBe(true);
  });

  it("does not merge open slots at different times", () => {
    const morning = slot({ startsAt: "2026-10-09T10:00:00.000Z" });
    const afternoon = slot({ startsAt: "2026-10-09T14:00:00.000Z" });
    const groups = groupCalendarRows([
      { slot: morning, past: false },
      { slot: afternoon, past: false },
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps the group at the first member's position in the list", () => {
    const first = slot({ startsAt: "2026-10-09T10:00:00.000Z" });
    const second = slot({
      startsAt: "2026-10-09T14:00:00.000Z",
      location: "Room A",
    });
    const third = slot({ startsAt: "2026-10-09T12:00:00.000Z", topic });
    const fourth = slot({
      startsAt: "2026-10-09T14:00:00.000Z",
      location: "Room B",
    });
    const groups = groupCalendarRows(
      [first, second, third, fourth].map((s) => ({ slot: s, past: false })),
    );
    expect(groups.map((g) => g.slots.length)).toEqual([1, 2, 1]);
  });
});

describe("groupLocations", () => {
  it("joins distinct non-empty locations with commas", () => {
    expect(
      groupLocations([
        slot({ location: "Room A" }),
        slot({ location: "" }),
        slot({ location: "Room B" }),
        slot({ location: "Room A" }),
      ]),
    ).toBe("Room A, Room B");
  });
});
