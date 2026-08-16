import {
  calendarConfirmPolicy,
  canConfirmSession,
  canDiscussSlots,
  canProposeSession,
  isAdmin,
  isElector,
  isHost,
  type Role,
  type Viewer,
} from "@timetable/shared";

import type { CalendarPerms } from "./calendarTypes";

/** The one derivation of what a viewer may do on a calendar row — used by
 * the calendar page and, since the topic-workbench renders the same rows
 * (2026-08-16), by My Topics too. Keeping it in one place is the point:
 * the two surfaces drifted while each built its own. */
export function buildCalendarPerms(
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
    canDiscuss: canDiscussSlots(viewer),
    canPropose: canProposeSession(viewer, policy),
    canConfirm: canConfirmSession(viewer, policy),
    viewerId,
  };
}
