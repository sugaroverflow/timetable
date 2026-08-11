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
  cellKey: string | null;
  /** Locations offered at this time, chosen at creation (2026-08-11) —
   * empty only on legacy slots and in forums with no configured locations. */
  locations: string[];
  sessions: CalendarSession[];
  viewerState: AvailabilityState | null;
  counts: { green: number; yellow: number; red: number };
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
  /** Pencil a session / propose an off-piste slot (policy-dependent). */
  canPropose: boolean;
  /** Confirm a session (policy-dependent). */
  canConfirm: boolean;
  viewerId: string | null;
};
