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
import { CalendarTable } from "@/components/CalendarTable";
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
import {
  parseTimetableSettings,
  pluralLabel,
  roleLabel,
} from "@/lib/timetableSettings";

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
  topic { id title topicSlug hostId hostName }
  counts { green yellow red }
  perUser { userId name image state }
`;

const QUERY = `
  query Calendar($s: String!, $audience: String, $past: Boolean) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    calendar(idOrSlug: $s, audience: $audience, includePast: $past) { ${SLOT_FIELDS} }
    topicFeed(idOrSlug: $s) { id title hostId hostName heartCount }
  }
`;

const QUERY_AUTHED = `
  query CalendarAuthed($s: String!, $audience: String, $past: Boolean) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    me { id }
    calendar(idOrSlug: $s, audience: $audience, includePast: $past) { ${SLOT_FIELDS} }
    topicFeed(idOrSlug: $s) { id title hostId hostName heartCount }
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
  electorsLabel,
}: {
  calendar: CalendarSlot[];
  topics: TopicOption[];
  perms: CalendarPerms;
  hostView: boolean;
  audience?: string;
  location?: string;
  electorsLabel: string;
}) {
  const locations = [
    ...new Set(calendar.map((s) => s.location).filter(Boolean)),
  ].sort();

  if (!perms.canSeeHostOnly && locations.length === 0) return null;

  return (
    // Flush floating filter bar, same treatment as the All Topics toolbar
    // (QA 2026-08-02) — sits directly above the table.
    <div className="toolbar feed-toolbar">
      {perms.canSeeHostOnly ? (
        <AudienceFilter
          value={audience ?? "all"}
          isHost={hostView}
          admin={perms.canAdmin}
          topics={topics}
          electorsLabel={electorsLabel}
        />
      ) : null}
      {locations.length > 0 ? (
        <LocationFilter value={location ?? ""} locations={locations} />
      ) : null}
    </div>
  );
}

function isPast(slot: CalendarSlot): boolean {
  return new Date(slot.endsAt).getTime() < Date.now();
}

/** The active lens topic (from ?audience=hearted_topic:<id>), or null for
 * "All electors" — it doubles as the comment attachment (QA 2026-08-03). */
function findLensTopic(
  audience: string | undefined,
  topicFeed: TopicOption[],
): TopicOption | null {
  if (!audience?.startsWith("hearted_topic:")) return null;
  const id = audience.slice("hearted_topic:".length);
  return topicFeed.find((t) => t.id === id) ?? null;
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

/** Legend + the slot table (or the empty state). */
function CalendarBody({
  slug,
  visibleSlots,
  anySlots,
  perms,
  claimTopics,
  lensTopic,
  adminLabel,
  past,
  base,
}: {
  slug: string;
  visibleSlots: CalendarSlot[];
  anySlots: boolean;
  perms: CalendarPerms;
  claimTopics: TopicOption[];
  lensTopic: TopicOption | null;
  adminLabel: string;
  past: boolean;
  base: string;
}) {
  if (visibleSlots.length === 0) {
    return <CalendarEmpty anySlots={anySlots} canAdmin={perms.canAdmin} />;
  }
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <CalendarTable
        rows={visibleSlots.map((slot) => ({ slot, past: isPast(slot) }))}
        slug={slug}
        perms={perms}
        claimTopics={claimTopics}
        lensTopic={lensTopic}
        adminLabel={adminLabel}
        showingPast={past}
        base={base}
      />
      {perms.canSeeHostOnly || perms.canSetAvailability ? <Legend /> : null}
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
  adminLabel,
}: {
  slug: string;
  perms: CalendarPerms;
  calendar: NonNullable<ReturnType<typeof parseTimetableSettings>["calendar"]>;
  myPattern: Record<string, AvailabilityState>;
  claimTopics: TopicOption[];
  adminLabel: string;
}) {
  return (
    <>
      {perms.canAdmin ? (
        <CalendarSetup slug={slug} current={calendar} adminLabel={adminLabel} />
      ) : null}
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

  // Hosts pencil/claim/filter by their own published topics; admins see
  // every topic (the lens groups them by host — QA 2026-08-02).
  const claimTopics = perms.canAdmin
    ? data.topicFeed
    : data.topicFeed.filter((t) => t.hostId === viewerId);

  const lensTopic = findLensTopic(audience, data.topicFeed);

  const visibleSlots = location
    ? data.calendar.filter((s) => s.location === location)
    : data.calendar;

  return (
    <div className="stack">
      <div
        className="page-head row wrap"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <h2 className="page-title" style={{ margin: 0 }}>
          Calendar
        </h2>
        <a className="btn btn-ghost" href={buildIcsUrl(slug, data.myIcsToken)}>
          Subscribe (ICS)
        </a>
      </div>

      <CalendarCards
        slug={slug}
        perms={perms}
        calendar={calendarSettings}
        myPattern={parsePattern(data.myAvailabilityPattern)}
        claimTopics={claimTopics}
        adminLabel={adminLabel}
      />

      <CalendarToolbar
        calendar={data.calendar}
        topics={claimTopics}
        perms={perms}
        hostView={isHost(roles)}
        audience={audience}
        location={location}
        electorsLabel={pluralLabel(
          roleLabel(settings.roleLabels, "elector"),
        ).toLowerCase()}
      />

      <CalendarBody
        slug={slug}
        visibleSlots={visibleSlots}
        anySlots={data.calendar.length > 0}
        perms={perms}
        claimTopics={claimTopics}
        lensTopic={lensTopic}
        adminLabel={adminLabel}
        past={past}
        base={base}
      />
    </div>
  );
}
