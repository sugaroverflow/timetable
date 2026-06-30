import { auth } from "@clerk/nextjs/server";
import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { env } from "@/env";
import { AudienceFilter } from "@/components/AudienceFilter";
import { LocationFilter } from "@/components/LocationFilter";
import { SlotAdminForm } from "@/components/SlotAdminForm";
import { SlotCard, type CalendarPerms } from "@/components/SlotCard";
import { WeekdayPatternControl } from "@/components/WeekdayPatternControl";
import type { CalendarSlot, TopicOption } from "@/lib/calendarTypes";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  timetable: { viewerRoles: string[] } | null;
  calendar: CalendarSlot[];
  topicFeed: TopicOption[];
  myIcsToken?: string | null;
};

const SLOT_FIELDS = `
  id startsAt endsAt location commentCount viewerState
  topics { id title }
  counts { green yellow red }
  perUser { userId name state }
`;

const QUERY = `
  query Calendar($s: String!, $audience: String) {
    timetable(idOrSlug: $s) { viewerRoles }
    calendar(idOrSlug: $s, audience: $audience) { ${SLOT_FIELDS} }
    topicFeed(idOrSlug: $s) { id title }
  }
`;

const QUERY_AUTHED = `
  query CalendarAuthed($s: String!, $audience: String) {
    timetable(idOrSlug: $s) { viewerRoles }
    calendar(idOrSlug: $s, audience: $audience) { ${SLOT_FIELDS} }
    topicFeed(idOrSlug: $s) { id title }
    myIcsToken
  }
`;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ audience?: string; location?: string }>;
}) {
  const { slug } = await params;
  const { audience, location } = await searchParams;
  const { userId } = await auth();

  const data = await gqlFetch<Data>(userId ? QUERY_AUTHED : QUERY, {
    s: slug,
    audience: audience ?? null,
  });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];

  const perms: CalendarPerms = {
    canSetAvailability: isElector(roles),
    canSeeHostOnly: isHost(roles) || isAdmin(roles),
    canAdmin: isAdmin(roles),
  };

  const icsUrl =
    `${env.apiUrl}/api/timetables/${slug}/calendar.ics` +
    (data.myIcsToken ? `?token=${data.myIcsToken}` : "");

  const locations = [
    ...new Set(data.calendar.map((s) => s.location).filter(Boolean)),
  ].sort();

  const visibleSlots = location
    ? data.calendar.filter((s) => s.location === location)
    : data.calendar;

  return (
    <div className="stack">
      <div className="toolbar">
        {perms.canSeeHostOnly ? (
          <>
            <label>Audience</label>
            <AudienceFilter
              value={audience ?? "all"}
              isHost={isHost(roles)}
              topics={data.topicFeed}
            />
          </>
        ) : null}
        {locations.length > 0 ? (
          <LocationFilter value={location ?? ""} locations={locations} />
        ) : null}
        <span className="spacer" />
        <a className="btn btn-ghost" href={icsUrl}>
          Subscribe (ICS)
        </a>
      </div>

      {perms.canAdmin ? <SlotAdminForm slug={slug} /> : null}
      {perms.canSetAvailability ? <WeekdayPatternControl slug={slug} /> : null}

      {visibleSlots.length === 0 ? (
        <div className="notice">
          {data.calendar.length === 0
            ? `No timeslots yet${perms.canAdmin ? " — add one above." : "."}`
            : "No slots match this filter."}
        </div>
      ) : (
        <ul className="list">
          {visibleSlots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              slug={slug}
              perms={perms}
              topicOptions={data.topicFeed}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
