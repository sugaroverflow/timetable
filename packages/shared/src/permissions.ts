import {
  isAdmin,
  isElector,
  isHost,
  isMember,
  isOwner,
  type Privacy,
  type Role,
} from "./roles";

/**
 * The acting user evaluated in the context of a single timetable. `userId` is
 * null for anonymous visitors; `roles` are that user's roles in this timetable.
 */
export type Viewer = {
  userId: string | null;
  roles: readonly Role[];
};

export const ANONYMOUS: Viewer = { userId: null, roles: [] };

export function isAuthenticated(viewer: Viewer): boolean {
  return viewer.userId !== null;
}

/** Can the viewer load the timetable at all? */
export function canReadTimetable(privacy: Privacy, viewer: Viewer): boolean {
  switch (privacy) {
    case "public":
      // Anyone, including anonymous, can read the feed and comments.
      return true;
    case "private":
      return isAuthenticated(viewer) && isMember(viewer.roles);
    case "deactivated":
      return isAuthenticated(viewer) && isAdmin(viewer.roles);
    default:
      return false;
  }
}

/** Only logged-in electors can heart topics. */
export function canHeart(viewer: Viewer): boolean {
  return isAuthenticated(viewer) && isElector(viewer.roles);
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

export function canModerate(viewer: Viewer): boolean {
  return isAdmin(viewer.roles);
}

export function canManageMembers(viewer: Viewer): boolean {
  return isAdmin(viewer.roles);
}

export function canEditSettings(viewer: Viewer): boolean {
  return isAdmin(viewer.roles);
}

export function canTransferOwnership(viewer: Viewer): boolean {
  return isOwner(viewer.roles);
}
