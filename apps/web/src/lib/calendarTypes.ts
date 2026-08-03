export type AvailabilityState = "green" | "yellow" | "red";

export type SlotStatus = "empty" | "proposed" | "confirmed";

export type CalendarSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: SlotStatus;
  url: string;
  cellKey: string | null;
  topic: {
    id: string;
    title: string;
    topicSlug: string | null;
    hostId: string;
    hostName: string | null;
  } | null;
  /** Office-hours sessions (no topic): whose they are. */
  sessionHost: { id: string; name: string | null } | null;
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
