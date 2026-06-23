import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { AudienceFilter } from "@/components/AudienceFilter";
import { SlotAdminForm } from "@/components/SlotAdminForm";
import { SlotCard, type CalendarPerms } from "@/components/SlotCard";
import { WeekdayPatternControl } from "@/components/WeekdayPatternControl";
import type { CalendarSlot, TopicOption } from "@/lib/calendarTypes";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  timetable: { viewerRoles: string[] } | null;
  calendar: CalendarSlot[];
  topicFeed: TopicOption[];
};

const QUERY = `
  query Calendar($s: String!, $audience: String) {
    timetable(idOrSlug: $s) { viewerRoles }
    calendar(idOrSlug: $s, audience: $audience) {
      id startsAt endsAt location commentCount viewerState
      topics { id title }
      counts { green yellow red }
      perUser { userId name state }
    }
    topicFeed(idOrSlug: $s) { id title }
  }
`;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  const { slug } = await params;
  const { audience } = await searchParams;

  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    audience: audience ?? null,
  });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];

  const perms: CalendarPerms = {
    canSetAvailability: isElector(roles),
    canSeeHostOnly: isHost(roles) || isAdmin(roles),
    canAdmin: isAdmin(roles),
  };

  return (
    <div className="stack">
      {perms.canSeeHostOnly ? (
        <div className="toolbar">
          <label>Audience</label>
          <AudienceFilter
            value={audience ?? "all"}
            isHost={isHost(roles)}
            topics={data.topicFeed}
          />
        </div>
      ) : null}

      {perms.canAdmin ? <SlotAdminForm slug={slug} /> : null}
      {perms.canSetAvailability ? <WeekdayPatternControl slug={slug} /> : null}

      {data.calendar.length === 0 ? (
        <div className="notice">
          No timeslots yet{perms.canAdmin ? " — add one above." : "."}
        </div>
      ) : (
        <ul className="list">
          {data.calendar.map((slot) => (
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
