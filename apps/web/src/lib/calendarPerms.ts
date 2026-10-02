import {
  calendarConfirmPolicy,
  canConfirmSession,
  canDiscussSlots,
  canProposeSession,
  isAdmin,
  isCalendarEnabled,
  isElector,
  isHost,
  officeHoursLabel,
  type Role,
  type TimetableSettings,
  type Viewer,
} from "@timetable/shared";

import type { CalendarPerms, WorkbenchCalendar } from "./calendarTypes";

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

/** Everything a topic card's Scheduling or Sessions tab needs to render
 * calendar rows — or null when the forum's calendar is off, which is what
 * hides those tabs (2026-08-16). */
export function buildWorkbenchCalendar(
  settings: TimetableSettings,
  roles: Role[],
  viewerId: string | null,
): WorkbenchCalendar | null {
  if (!isCalendarEnabled(settings)) return null;
  return {
    perms: buildCalendarPerms(roles, viewerId, calendarConfirmPolicy(settings)),
    locations: settings.calendar?.locations ?? [],
    officeHoursLabel: officeHoursLabel(settings),
  };
}
