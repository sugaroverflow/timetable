export type AvailabilityState = "green" | "yellow" | "red";

export type SessionStatus = "proposed" | "confirmed";

/** A booking in a slot (bookings model, 2026-08-06): a session subject at
 * a location. Several can share a slot — different locations, same time. */
export type CalendarSession = {
  id: string;
  location: string;
  status: SessionStatus;
  url: string;
  /** Admin-filled custom session title ("" when not custom). */
  customTitle: string;
  topic: {
    id: string;
    title: string;
    topicSlug: string | null;
    hostId: string;
    hostName: string | null;
  } | null;
  /** Office-hours sessions (no topic): whose they are. */
  sessionHost: { id: string; name: string | null } | null;
};

/** A timeslot is a pure time window; availability and discussion attach
 * here, bookings are `sessions` (location-sorted, empty when open). */
export type CalendarSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  /** Locations offered at this time, chosen at creation (2026-08-11) —
   * empty only on legacy slots and in forums with no configured locations. */
  locations: string[];
  sessions: CalendarSession[];
  viewerState: AvailabilityState | null;
  /** Group availability — null for electors and anonymous viewers, who
   * never see the wash (host/admin only since 2026-08-16). */
  counts: { green: number; yellow: number; red: number } | null;
  perUser:
    | {
        userId: string;
        name: string | null;
        image: string | null;
        state: AvailabilityState;
      }[]
    | null;
  commentCount: number;
};

/** What a surface outside the calendar page needs to render calendar
 * rows: who the viewer is, the forum's rooms, and its office-hours word.
 * Null where the forum has the calendar switched off (2026-08-16). */
export type WorkbenchCalendar = {
  perms: CalendarPerms;
  locations: string[];
  officeHoursLabel: string;
};

export type TopicOption = {
  id: string;
  title: string;
  hostId: string;
  hostName?: string | null;
  heartCount?: number;
};

/** Topics keyed by host display name, hosts A–Z — the admin optgroup shape
 * shared by the lens filter and the pencil-in/propose selects. */
export function groupTopicsByHost(
  topics: TopicOption[],
): Map<string, TopicOption[]> {
  const groups = new Map<string, TopicOption[]>();
  for (const topic of topics) {
    const host = topic.hostName ?? "Unknown host";
    groups.set(host, [...(groups.get(host) ?? []), topic]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** What the viewer may do on the calendar page — resolved server-side from
 * roles + the forum's confirm policy and threaded through the row UI. */
export type CalendarPerms = {
  canSetAvailability: boolean;
  canSeeHostOnly: boolean;
  canAdmin: boolean;
  /** Read/post in per-slot discussion threads — any member (2026-08-14). */
  canDiscuss: boolean;
  /** Pencil a session / propose an off-piste slot (policy-dependent). */
  canPropose: boolean;
  /** Confirm a session (policy-dependent). */
  canConfirm: boolean;
  viewerId: string | null;
};
