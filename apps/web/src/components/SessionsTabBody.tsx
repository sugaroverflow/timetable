"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CalendarSlot, WorkbenchCalendar } from "@/lib/calendarTypes";
import { clientGql } from "@/lib/clientGraphql";
import { CALENDAR_SLOT_FIELDS } from "@/lib/gqlFragments";
import type { RoleLabels } from "@/lib/timetableSettings";

import { CalendarTable } from "./CalendarTable";

const QUERY = `query TopicSessions($s: String!, $t: String!) {
  topicSessions(idOrSlug: $s, topicId: $t) { ${CALENDAR_SLOT_FIELDS} }
}`;

/** sessions-tab (2026-08-14; calendar rows since 2026-08-16, decision 13):
 * the Sessions tab of topic-tabs on feed/permalink/queue cards (NOT My
 * Topics, whose host has the Scheduling tab). Every future slot where this
 * topic is pencilled or confirmed, fetched lazily on first mount (the
 * inactive tab panel is unmounted, so mounting = tab opened) and rendered
 * as ordinary calendar rows: bookings, rooms, the elector's own 🟢🟡🔴,
 * and the slot's chat behind the fold. The wash stays host/admin-only,
 * exactly as on the calendar page — a card can't leak what the calendar
 * doesn't. */
export function SessionsTabBody({
  slug,
  topicId,
  calendar,
  adminLabel,
  roleLabels,
}: {
  slug: string;
  topicId: string;
  /** Null while the forum's calendar is off — then there's no tab. */
  calendar: WorkbenchCalendar | null;
  adminLabel: string;
  roleLabels?: RoleLabels;
}) {
  const [rows, setRows] = useState<CalendarSlot[] | null | undefined>(
    undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientGql<{ topicSessions: CalendarSlot[] | null }>(QUERY, {
      s: slug,
      t: topicId,
    })
      .then((res) => {
        if (!cancelled) setRows(res.topicSessions);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, topicId]);

  if (failed) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Couldn&rsquo;t load the sessions.
      </div>
    );
  }
  if (rows === undefined) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        Loading…
      </div>
    );
  }
  if (!calendar || rows === null || rows.length === 0) {
    return (
      <div className="faint" style={{ fontSize: 12 }}>
        No upcoming sessions.
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <CalendarTable
        title="Sessions"
        // A flat list of a topic's own dates, not a chronology — so no
        // month headings, and the rows carry their year.
        grouped={false}
        rows={rows.map((slot) => ({ slot, past: false }))}
        slug={slug}
        locations={calendar.locations}
        perms={calendar.perms}
        // No claim/lens here: this card is about the topic, but the tab is
        // where you find out WHEN it runs — arguing for a time is the
        // calendar's and the workbench's job.
        claimTopics={[]}
        lensTopic={null}
        adminLabel={adminLabel}
        officeHoursLabel={calendar.officeHoursLabel}
        roleLabels={roleLabels}
      />
      <Link
        href={`/f/${slug}/calendar`}
        className="faint"
        style={{ fontSize: 12 }}
      >
        Open the calendar
      </Link>
    </div>
  );
}
