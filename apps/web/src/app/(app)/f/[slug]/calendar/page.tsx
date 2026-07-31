import Link from "next/link";

import { auth } from "@clerk/nextjs/server";
import {
  calendarConfirmPolicy,
  canConfirmSession,
  canProposeSession,
  isAdmin,
  isCalendarEnabled,
  isElector,
  isHost,
  type Role,
  type Viewer,
} from "@timetable/shared";

import { env } from "@/env";
import { AudienceFilter } from "@/components/AudienceFilter";
import { CalendarRow } from "@/components/CalendarRow";
import { CalendarSetup } from "@/components/CalendarSetup";
import { EmptyState } from "@/components/EmptyState";
import { LocationFilter } from "@/components/LocationFilter";
import { PatternGrid } from "@/components/PatternGrid";
import { ProposeSlotForm } from "@/components/ProposeSlotForm";
import type {
  AvailabilityState,
  CalendarPerms,
  CalendarSlot,
  TopicOption,
} from "@/lib/calendarTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  me: { id: string } | null;
  calendar: CalendarSlot[];
  topicFeed: TopicOption[];
  myIcsToken?: string | null;
  myAvailabilityPattern?: string | null;
};

const SLOT_FIELDS = `
  id startsAt endsAt location status url cellKey commentCount viewerState
  topic { id title hostId }
  counts { green yellow red }
  perUser { userId name image state }
`;

const QUERY = `
  query Calendar($s: String!, $audience: String, $past: Boolean) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    calendar(idOrSlug: $s, audience: $audience, includePast: $past) { ${SLOT_FIELDS} }
    topicFeed(idOrSlug: $s) { id title hostId }
  }
`;

const QUERY_AUTHED = `
  query CalendarAuthed($s: String!, $audience: String, $past: Boolean) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    me { id }
    calendar(idOrSlug: $s, audience: $audience, includePast: $past) { ${SLOT_FIELDS} }
    topicFeed(idOrSlug: $s) { id title hostId }
    myIcsToken
    myAvailabilityPattern(idOrSlug: $s)
  }
`;

function buildIcsUrl(slug: string, token: string | null | undefined): string {
  return (
    `${env.apiUrl}/api/forums/${slug}/calendar.ics` +
    (token ? `?token=${token}` : "")
  );
}

function CalendarToolbar({
  calendar,
  topics,
  perms,
  hostView,
  audience,
  location,
  past,
  icsUrl,
  base,
}: {
  calendar: CalendarSlot[];
  topics: TopicOption[];
  perms: CalendarPerms;
  hostView: boolean;
  audience?: string;
  location?: string;
  past: boolean;
  icsUrl: string;
  base: string;
}) {
  const locations = [
    ...new Set(calendar.map((s) => s.location).filter(Boolean)),
  ].sort();

  return (
    <div className="toolbar">
      {perms.canSeeHostOnly ? (
        <>
          <label>Topic</label>
          <AudienceFilter
            value={audience ?? "all"}
            isHost={hostView}
            topics={topics}
          />
        </>
      ) : null}
      {locations.length > 0 ? (
        <LocationFilter value={location ?? ""} locations={locations} />
      ) : null}
      <span className="spacer" />
      {perms.canSeeHostOnly ? <AudienceCount calendar={calendar} /> : null}
      <Link
        className="btn btn-ghost"
        href={past ? `${base}/calendar` : `${base}/calendar?past=1`}
      >
        {past ? "Hide past" : "Show past"}
      </Link>
      <a className="btn btn-ghost" href={icsUrl}>
        Subscribe (ICS)
      </a>
    </div>
  );
}

/** Every slot carries the full audience in perUser (host/admin only), so
 * the audience size is the same across slots. */
function AudienceCount({ calendar }: { calendar: CalendarSlot[] }) {
  const audienceCount = calendar[0]?.perUser?.length ?? null;
  if (audienceCount === null) return null;
  return (
    <span className="faint" style={{ fontSize: 12 }}>
      {audienceCount} elector{audienceCount === 1 ? "" : "s"} in view
    </span>
  );
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function isPast(slot: CalendarSlot): boolean {
  return new Date(slot.endsAt).getTime() < Date.now();
}

/** Slots in ascending order, split under month headings. */
function groupByMonth(
  slots: CalendarSlot[],
): { label: string; slots: CalendarSlot[] }[] {
  const groups: { label: string; slots: CalendarSlot[] }[] = [];
  for (const slot of slots) {
    const label = monthLabel(slot.startsAt);
    const last = groups.at(-1);
    if (last && last.label === label) last.slots.push(slot);
    else groups.push({ label, slots: [slot] });
  }
  return groups;
}

function buildPerms(
  roles: Role[],
  viewerId: string | null,
  policy: ReturnType<typeof calendarConfirmPolicy>,
): CalendarPerms {
  const viewer: Viewer = { userId: viewerId, roles };
  const admin = isAdmin(roles);
  return {
    canSetAvailability: isElector(roles),
    canSeeHostOnly: isHost(roles) || admin,
    canAdmin: admin,
    canPropose: canProposeSession(viewer, policy),
    canConfirm: canConfirmSession(viewer, policy),
    viewerId,
  };
}

function parsePattern(
  raw: string | null | undefined,
): Record<string, AvailabilityState> {
  try {
    return JSON.parse(raw ?? "{}") as Record<string, AvailabilityState>;
  } catch {
    return {};
  }
}

function CalendarDisabledNotice({
  admin,
  base,
}: {
  admin: boolean;
  base: string;
}) {
  return (
    <div className="notice">
      The calendar isn’t enabled for this forum.
      {admin ? (
        <>
          {" "}
          Switch it on in <Link href={`${base}/settings`}>Forum Settings</Link>.
        </>
      ) : null}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="i-g" /> Available
      </span>
      <span>
        <i className="i-y" /> Maybe
      </span>
      <span>
        <i className="i-r" /> Can’t
      </span>
    </div>
  );
}

function CalendarEmpty({
  anySlots,
  canAdmin,
}: {
  anySlots: boolean;
  canAdmin: boolean;
}) {
  if (anySlots) {
    return (
      <EmptyState
        icon="▦"
        title="No slots match"
        hint="Try a different location."
      />
    );
  }
  return (
    <EmptyState
      icon="▦"
      title="No timeslots yet"
      hint={
        canAdmin
          ? "Set a pattern above and generate slots to get started."
          : undefined
      }
    />
  );
}

/** Legend + month-grouped rows (or the empty state). */
function CalendarBody({
  visibleSlots,
  anySlots,
  perms,
  claimTopics,
  adminLabel,
}: {
  visibleSlots: CalendarSlot[];
  anySlots: boolean;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  adminLabel: string;
}) {
  if (visibleSlots.length === 0) {
    return <CalendarEmpty anySlots={anySlots} canAdmin={perms.canAdmin} />;
  }
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <Legend />
      {groupByMonth(visibleSlots).map((group) => (
        <section key={group.label} className="stack" style={{ gap: 8 }}>
          <h3 className="section-title">{group.label}</h3>
          <ul className="list">
            {group.slots.map((slot) => (
              <CalendarRow
                key={slot.id}
                slot={slot}
                perms={perms}
                claimTopics={claimTopics}
                adminLabel={adminLabel}
                past={isPast(slot)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The action cards between toolbar and table, gated per role. */
function CalendarCards({
  slug,
  perms,
  calendar,
  myPattern,
  claimTopics,
}: {
  slug: string;
  perms: CalendarPerms;
  calendar: NonNullable<ReturnType<typeof parseTimetableSettings>["calendar"]>;
  myPattern: Record<string, AvailabilityState>;
  claimTopics: TopicOption[];
}) {
  return (
    <>
      {perms.canAdmin ? <CalendarSetup slug={slug} current={calendar} /> : null}
      {perms.canSetAvailability && (calendar.patternCells?.length ?? 0) > 0 ? (
        <PatternGrid
          slug={slug}
          cells={calendar.patternCells ?? []}
          initial={myPattern}
        />
      ) : null}
      {perms.canPropose && claimTopics.length > 0 ? (
        <ProposeSlotForm
          slug={slug}
          topics={claimTopics}
          locations={calendar.locations ?? []}
        />
      ) : null}
    </>
  );
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    audience?: string;
    location?: string;
    past?: string;
  }>;
}) {
  const { slug } = await params;
  const { audience, location, past: pastParam } = await searchParams;
  const { userId } = await auth();
  const past = pastParam === "1";

  const data = await gqlFetch<Data>(userId ? QUERY_AUTHED : QUERY, {
    s: slug,
    audience: audience ?? null,
    past,
  });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const base = `/f/${slug}`;

  if (!isCalendarEnabled(settings)) {
    return <CalendarDisabledNotice admin={isAdmin(roles)} base={base} />;
  }

  const viewerId = data.me?.id ?? null;
  const perms = buildPerms(roles, viewerId, calendarConfirmPolicy(settings));
  const adminLabel = roleLabel(settings.roleLabels, "admin");
  const calendarSettings = settings.calendar ?? {};

  // Hosts pencil/claim their own published topics; admins any topic.
  const claimTopics = perms.canAdmin
    ? data.topicFeed
    : data.topicFeed.filter((t) => t.hostId === viewerId);

  const visibleSlots = location
    ? data.calendar.filter((s) => s.location === location)
    : data.calendar;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">Calendar</h2>
      </div>

      <CalendarToolbar
        calendar={data.calendar}
        topics={data.topicFeed}
        perms={perms}
        hostView={isHost(roles)}
        audience={audience}
        location={location}
        past={past}
        icsUrl={buildIcsUrl(slug, data.myIcsToken)}
        base={base}
      />

      <CalendarCards
        slug={slug}
        perms={perms}
        calendar={calendarSettings}
        myPattern={parsePattern(data.myAvailabilityPattern)}
        claimTopics={claimTopics}
      />

      <CalendarBody
        visibleSlots={visibleSlots}
        anySlots={data.calendar.length > 0}
        perms={perms}
        claimTopics={claimTopics}
        adminLabel={adminLabel}
      />
    </div>
  );
}
