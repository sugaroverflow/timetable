import type { IcsSlot } from "@timetable/core";

/** Format a Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ. */
function icsDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return (
    s
      .replace(/\\/g, "\\\\")
      // Bare CRs would survive the \n rule and lenient clients treat them
      // as line terminators — i.e. ICS property injection. Normalise every
      // CR/CRLF to LF first so the \n rule catches them all.
      .replace(/\r\n?/g, "\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n")
  );
}

/** Build an RFC 5545 VCALENDAR for a timetable's slots.
 * `officeHoursLabel` names topic-less host sessions ("Hannah — Office
 * hours"); a bare name would be cryptic in a calendar app. */
export function buildIcs(
  calendarName: string,
  slots: IcsSlot[],
  officeHoursLabel = "Office hours",
): string {
  const now = icsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sparkle Bureaucracy//Topic//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const slot of slots) {
    const summary =
      slot.topicTitle ??
      (slot.customTitle ||
        (slot.sessionHostName
          ? `${slot.sessionHostName} — ${officeHoursLabel}`
          : "Open slot"));
    // Session state maps straight onto RFC 5545: proposed → TENTATIVE,
    // confirmed → CONFIRMED; empty slots carry no STATUS at all.
    const status =
      slot.status === "confirmed"
        ? "CONFIRMED"
        : slot.status === "proposed"
          ? "TENTATIVE"
          : null;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${slot.id}@topic.forum`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(slot.startsAt)}`,
      `DTEND:${icsDate(slot.endsAt)}`,
      `SUMMARY:${escapeText(summary)}`,
      `LOCATION:${escapeText(slot.location)}`,
      ...(status ? [`STATUS:${status}`] : []),
      ...(slot.url ? [`URL:${escapeText(slot.url)}`] : []),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 wants CRLF line endings.
  return lines.join("\r\n");
}
