import {
  isAdmin,
  isElector,
  isHost,
  isMember,
  type Privacy,
  type Role,
} from "./roles";

/**
 * The acting user evaluated in the context of a single timetable. `userId` is
 * null for anonymous visitors; `roles` are that user's roles in this timetable.
 * `sysadmin` marks a site operator (SYSADMIN_EMAILS, set by the API layer):
 * it unlocks READ checks only — every write check ignores it, so operator
 * oversight of private forums is read-only by construction (2026-07-29).
 */
export type Viewer = {
  userId: string | null;
  roles: readonly Role[];
  sysadmin?: boolean;
};

export const ANONYMOUS: Viewer = { userId: null, roles: [] };

export function isAuthenticated(viewer: Viewer): boolean {
  return viewer.userId !== null;
}

/** Can the viewer load the timetable at all? */
export function canReadTimetable(privacy: Privacy, viewer: Viewer): boolean {
  // Site operators read everything, private forums included — in-product
  // and accountable rather than ad hoc via the database (2026-07-29).
  if (viewer.sysadmin) return true;
  switch (privacy) {
    case "public":
    case "hosts_only":
    case "no_comments":
      // Anyone, including anonymous, can read topics; what else they see
      // is refined by canSeeComments / canSeePersonProfile below.
      return true;
    case "private":
      return isAuthenticated(viewer) && isMember(viewer.roles);
    case "deactivated":
      return isAuthenticated(viewer) && isAdmin(viewer.roles);
    default:
      return false;
  }
}

/**
 * QA #42 visibility matrix. Members always see everything their role
 * allows; non-members (signed-in or anonymous) are "the public" and are
 * restricted by the hosts_only / no_comments levels.
 */
export function canSeeComments(privacy: Privacy, viewer: Viewer): boolean {
  if (viewer.sysadmin) return true;
  if (isMember(viewer.roles)) return true;
  return privacy === "public";
}

/** Whether the viewer may see this person's profile/bio at all. */
export function canSeePersonProfile(
  privacy: Privacy,
  viewer: Viewer,
  personRoles: readonly Role[],
): boolean {
  if (viewer.sysadmin) return true;
  if (isMember(viewer.roles)) return true;
  if (privacy === "public" || privacy === "no_comments") return true;
  if (privacy === "hosts_only") {
    // The public sees who runs the forum — hosts AND admins — but never
    // the elector membership (QA 2026-07-27).
    return isHost(personRoles) || isAdmin(personRoles);
  }
  // private/deactivated timetables aren't readable by non-members anyway.
  return true;
}

/** Only logged-in electors can heart topics. */
export function canHeart(viewer: Viewer): boolean {
  return isAuthenticated(viewer) && isElector(viewer.roles);
}

/** Every member gets a Topic Queue (v2 2026-07-29 — hosts asked for it):
 * electors review with the ❤️ switcher, other members read through. */
export function canUseQueue(viewer: Viewer): boolean {
  return (
    isAuthenticated(viewer) &&
    (isElector(viewer.roles) || isHost(viewer.roles) || isAdmin(viewer.roles))
  );
}

/** Logged-in members (elector/host/admin) can post public comments. */
export function canComment(viewer: Viewer): boolean {
  return (
    isAuthenticated(viewer) &&
    (isElector(viewer.roles) || isHost(viewer.roles) || isAdmin(viewer.roles))
  );
}

/** Host-only comment threads and weighted-heart breakdowns. */
export function canSeeHostOnly(viewer: Viewer): boolean {
  return isHost(viewer.roles) || isAdmin(viewer.roles);
}

/** Hosts propose topics; admins can also create them (QA #42) and may
 * keep ownership or reassign to a host afterwards. */
export function canProposeTopics(viewer: Viewer): boolean {
  return (
    isAuthenticated(viewer) && (isHost(viewer.roles) || isAdmin(viewer.roles))
  );
}

/** The topic's owning host acting on their own topic. Distinct from
 * canEditTopic so callers can tell an owner edit from an admin override
 * (admin edits of someone else's topic are activity-logged). */
export function ownsTopicAsHost(viewer: Viewer, topicHostId: string): boolean {
  return viewer.userId === topicHostId && isHost(viewer.roles);
}

/** Edit, submit, or unpublish a topic: its owning host, or any admin. */
export function canEditTopic(viewer: Viewer, topicHostId: string): boolean {
  return ownsTopicAsHost(viewer, topicHostId) || isAdmin(viewer.roles);
}

export function canModerate(viewer: Viewer): boolean {
  return isAdmin(viewer.roles);
}

export function canManageMembers(viewer: Viewer): boolean {
  return isAdmin(viewer.roles);
}

export function canEditSettings(viewer: Viewer): boolean {
  return isAdmin(viewer.roles);
}
