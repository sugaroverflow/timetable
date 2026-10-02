import { describe, expect, it } from "vitest";

import { buildIcs } from "./ics";

const slot = {
  id: "slot-1",
  startsAt: new Date("2026-09-01T18:00:00.000Z"),
  endsAt: new Date("2026-09-01T20:00:00.000Z"),
  location: "Drawing Room",
  status: "confirmed" as const,
  url: "",
  topicTitle: "Plain Topic",
  sessionHostName: null,
  customTitle: "",
};

describe("buildIcs escaping", () => {
  it("escapes ICS metacharacters in text fields", () => {
    const ics = buildIcs("Forum; name, one", [slot]);
    expect(ics).toContain("X-WR-CALNAME:Forum\\; name\\, one");
    expect(ics).toContain("SUMMARY:Plain Topic");
  });

  it("neutralises bare CR/CRLF so no property can be injected", () => {
    // Lenient calendar clients treat a bare CR as a line terminator, so an
    // unescaped one in a title would let its tail masquerade as a new ICS
    // property on feeds served to third-party calendar apps.
    const ics = buildIcs("Cal", [
      { ...slot, topicTitle: "Nice title\r\nORGANIZER:mailto:evil@x" },
      { ...slot, id: "slot-2", topicTitle: "Bare\rATTENDEE:mailto:evil@x" },
    ]);
    // The payload survives only as escaped text on the SUMMARY line...
    expect(ics).toContain("SUMMARY:Nice title\\nORGANIZER:mailto:evil@x");
    expect(ics).toContain("SUMMARY:Bare\\nATTENDEE:mailto:evil@x");
    // ...and no line of the output starts with the injected properties.
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("ORGANIZER"))).toBe(false);
    expect(lines.some((l) => l.startsWith("ATTENDEE"))).toBe(false);
  });
});
