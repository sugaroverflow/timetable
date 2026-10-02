"use client";

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
 * doesn't — and charts THIS topic's hearters (Ed, QA 2026-08-16). */
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
    return <div className="hint">Couldn&rsquo;t load the sessions.</div>;
  }
  if (rows === undefined) {
    return <div className="hint">Loading…</div>;
  }
  if (!calendar || rows === null || rows.length === 0) {
    return <div className="hint">No upcoming sessions.</div>;
  }

  // Bare rows: the tab strip is the heading, the card is the frame, and
  // the sidebar already links the calendar (Ed, QA 2026-08-16).
  return (
    <CalendarTable
      title={null}
      card={false}
      // A flat list of a topic's own dates, not a chronology — so no
      // month headings, and the rows carry their year.
      grouped={false}
      rows={rows.map((slot) => ({ slot, past: false }))}
      slug={slug}
      locations={calendar.locations}
      // A host browsing someone else's card mustn't meet a pencil-in
      // control here (Ed, QA 2026-08-16): with no claim topics it could
      // only cross-book their office hours into this topic's slot. The
      // tab is a viewer surface — booking gestures live on the calendar
      // and the workbench. Admins keep their full slot controls.
      perms={
        calendar.perms.canAdmin
          ? calendar.perms
          : { ...calendar.perms, canPropose: false }
      }
      // No claim/lens here: this card is about the topic, but the tab is
      // where you find out WHEN it runs — arguing for a time is the
      // calendar's and the workbench's job.
      claimTopics={[]}
      lensTopic={null}
      adminLabel={adminLabel}
      officeHoursLabel={calendar.officeHoursLabel}
      roleLabels={roleLabels}
    />
  );
}
