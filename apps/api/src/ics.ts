import type { IcsSlot } from "@timetable/core";

/** Format a Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ. */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Build an RFC 5545 VCALENDAR for a timetable's slots. */
export function buildIcs(calendarName: string, slots: IcsSlot[]): string {
  const now = icsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sparkle Bureaucracy//Timetable//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const slot of slots) {
    const summary =
      slot.topicTitles.length > 0
        ? slot.topicTitles.join(", ")
        : "Open slot";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${slot.id}@timetable`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(slot.startsAt)}`,
      `DTEND:${icsDate(slot.endsAt)}`,
      `SUMMARY:${escapeText(summary)}`,
      `LOCATION:${escapeText(slot.location)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 wants CRLF line endings.
  return lines.join("\r\n");
}
