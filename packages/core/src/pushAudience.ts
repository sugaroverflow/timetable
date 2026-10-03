import {
  canEditTopic,
  canReadTimetable,
  canSeeHostOnly,
  canReadLounge,
  digestKindApplies,
  isAdmin,
  isCalendarEnabled,
  isPushKindEnabled,
  pushBodyLine,
  pushTitle,
  pushUrgency,
  topicPath,
  type DigestKind,
  type DigestKinds,
  type Privacy,
  type PushPayload,
  type Role,
  type TimetableSettings,
  type Viewer,
} from "@timetable/shared";

/**
 * The push sweep's per-recipient decisions (docs/web-push-plan.md §1 and
 * §3.2 steps 3–5), kept free of the database so every rule is unit-tested:
 * the readers in `pushEvents.ts` turn a window of events into CANDIDATES
 * (one per event per person it might reach) and load the recipients'
 * context; this module decides, per candidate, whether it alerts and what
 * the alert says.
 */

/** A comment's thread, which is also its tab in topic-tabs. */
export type PushCommentVisibility = "public" | "host_only" | "admin_only";

/** The topic an alert is about, with what its permalink needs. */
export type PushTopicRef = {
  id: string;
  title: string;
  slug: string | null;
  hostId: string;
  hostSlug: string | null;
  /** Published topics are readable by the forum; anything else only by its
   * host and admins (canEditTopic). */
  published: boolean;
};

/** What an alert says, by event. `who` is the actor's display name in the
 * forum (null for an ex-member, shown as "Someone"). */
export type PushMessage =
  | {
      type: "comment";
      commentId: string;
      visibility: PushCommentVisibility;
      topic: PushTopicRef;
      who: string | null;
      body: string;
    }
  | {
      type: "lounge";
      commentId: string;
      /** The conversation (its opening post's id). */
      rootId: string;
      /** An opening post (Markdown) rather than a reply (plain text). */
      isRoot: boolean;
      who: string | null;
      body: string;
    }
  | {
      type: "session";
      action: "confirm" | "clear" | "pencil";
      topic: PushTopicRef;
      startsAt: Date;
      location: string | null;
    }
  | { type: "heart"; gesture: "heart" | "hostHeart"; topic: PushTopicRef }
  | { type: "newTopic"; who: string | null; topic: PushTopicRef }
  | { type: "ready"; who: string | null; topic: PushTopicRef }
  | { type: "sentBack"; who: string | null; topic: PushTopicRef }
  | { type: "slotRelease"; count: number; firstStartsAt: Date }
  | { type: "newMember"; who: string | null };

/** One event as it might reach one person. */
export type PushCandidate = {
  /** The event (`comment:<id>`, `heart:<id>` …): a person gets one alert per
   * event, however many ways they qualify for it. */
  eventKey: string;
  userId: string;
  timetableId: string;
  /** When it happened — compared with the device's subscription time and
   * the thread's read mark. */
  at: Date;
  /** Who did it; never alerts them. Null when unknown (a deleted user). */
  actorId: string | null;
  /** The Push switches this person qualifies through (§1 kind map): the
   * alert goes when ANY of them is on and applies to their roles. `null`
   * marks a switch-less admin override (the sent-back notice). */
  kinds: DigestKind[] | null;
  message: PushMessage;
};

/** One membership as the sweep needs it. */
export type PushMembership = {
  roles: readonly Role[];
  deactivatedAt: Date | null;
  /** `digestSettings.push` — read only through `isPushKindEnabled`. */
  push: DigestKinds | null | undefined;
  loungeSeenAt: Date | null;
};

export type PushForum = {
  id: string;
  slug: string;
  name: string;
  privacy: Privacy;
  settings: TimetableSettings;
};

/** Everything the decisions read, looked up by key. */
export type PushRecipientContext = {
  membership(userId: string, timetableId: string): PushMembership | undefined;
  forum(timetableId: string): PushForum | undefined;
  /** The person's `comment_seen` mark on a topic (engagement). */
  commentSeenAt(userId: string, topicId: string): Date | undefined;
  /** How many forums the person is an active member of (the title gains
   * " · {forum}" when more than one). */
  forumCount(userId: string): number;
};

export type PushSkipReason =
  | "own-action"
  | "not-a-member"
  | "deactivated"
  | "forum-unreadable"
  | "thread-hidden"
  | "lounge-closed"
  | "calendar-off"
  | "kind-off"
  | "read-past";

export type PushDecision =
  | { send: true; kind: DigestKind | null }
  | { send: false; reason: PushSkipReason };

/** A decided alert, ready for the device fan-out. */
export type PushAlert = {
  userId: string;
  timetableId: string;
  /** The switch it went through; null for the switch-less sent-back notice. */
  kind: DigestKind | null;
  at: Date;
  urgency: "high" | "normal";
  payload: PushPayload;
  /** For the fan-out's "and n more in {forum}". */
  forum: { slug: string; name: string };
};

/** Whether this viewer may read this comment's thread (plan §1 "What is on
 * screen"): public — any member who can read the forum; {host}-only —
 * hosts and admins; drafting (`admin_only`) — the topic's host and admins.
 * A topic that isn't published is its host's and the admins' alone. */
export function canReadPushThread(
  viewer: Viewer,
  topic: Pick<PushTopicRef, "hostId" | "published">,
  visibility: PushCommentVisibility,
): boolean {
  if (!topic.published && !canEditTopic(viewer, topic.hostId)) return false;
  if (visibility === "host_only") return canSeeHostOnly(viewer);
  if (visibility === "admin_only") return canEditTopic(viewer, topic.hostId);
  return true;
}

/** The send-time visibility gate for one message (plan §1, the per-recipient
 * checks after membership and forum readability). */
function gate(message: PushMessage, viewer: Viewer, forum: PushForum) {
  switch (message.type) {
    case "comment":
      return canReadPushThread(viewer, message.topic, message.visibility)
        ? null
        : ("thread-hidden" as const);
    case "lounge":
      // The GraphQL resolver's gate (`seesLounge`): the room is on and the
      // viewer is a host or admin.
      return canReadLounge(forum.settings, viewer)
        ? null
        : ("lounge-closed" as const);
    case "session":
    case "slotRelease":
      if (!isCalendarEnabled(forum.settings)) return "calendar-off" as const;
      return message.type === "session" &&
        !canReadPushThread(viewer, message.topic, "public")
        ? ("thread-hidden" as const)
        : null;
    case "heart":
    case "newTopic":
      return canReadPushThread(viewer, message.topic, "public")
        ? null
        : ("thread-hidden" as const);
    case "ready":
    case "sentBack":
      // A draft: its host and admins only.
      return canEditTopic(viewer, message.topic.hostId)
        ? null
        : ("thread-hidden" as const);
    case "newMember":
      return isAdmin(viewer.roles) ? null : ("thread-hidden" as const);
  }
}

/** The person's read mark for the thread, when it has one. */
function readMark(
  candidate: PushCandidate,
  membership: PushMembership,
  ctx: PushRecipientContext,
): Date | undefined {
  const m = candidate.message;
  if (m.type === "comment")
    return ctx.commentSeenAt(candidate.userId, m.topic.id);
  if (m.type === "lounge") return membership.loungeSeenAt ?? undefined;
  return undefined;
}

/**
 * Does this candidate alert its person, and through which switch? The
 * order is the plan's §3.2 step 4: never their own action; an active
 * membership in a forum they can read; the thread's visibility for them;
 * the kind's Push switch and audience; the thread not already read past.
 * (The device's subscription time is the fan-out's check, per device.)
 */
export function decidePushCandidate(
  candidate: PushCandidate,
  ctx: PushRecipientContext,
): PushDecision {
  if (candidate.actorId && candidate.actorId === candidate.userId)
    return { send: false, reason: "own-action" };
  const membership = ctx.membership(candidate.userId, candidate.timetableId);
  const forum = ctx.forum(candidate.timetableId);
  if (!membership || !forum) return { send: false, reason: "not-a-member" };
  // member-deactivation: a suspension. Skipped, never unsubscribed — the
  // device belongs to the person, and reactivation replays nothing because
  // the window has moved on.
  if (membership.deactivatedAt) return { send: false, reason: "deactivated" };
  const viewer: Viewer = {
    userId: candidate.userId,
    roles: membership.roles,
  };
  if (!canReadTimetable(forum.privacy, viewer))
    return { send: false, reason: "forum-unreadable" };
  const hidden = gate(candidate.message, viewer, forum);
  if (hidden) return { send: false, reason: hidden };

  let kind: DigestKind | null = null;
  if (candidate.kinds !== null) {
    const roles = [...membership.roles];
    const on = candidate.kinds.find(
      (k) =>
        digestKindApplies(k, roles) && isPushKindEnabled(membership.push, k),
    );
    if (!on) return { send: false, reason: "kind-off" };
    kind = on;
  }

  const seen = readMark(candidate, membership, ctx);
  if (seen && seen >= candidate.at) return { send: false, reason: "read-past" };
  return { send: true, kind };
}

// ---------------------------------------------------------------------------
// Alert text and links (plan §1 "What an alert looks like")

/** The deployment's clock for session times — the digest schedule's
 * (`DIGEST_TIMEZONE`): forums carry no timezone setting yet. */
export const PUSH_TIMEZONE = "Europe/London";

/** "Tue 14 Oct, 18:00" */
export function pushWhen(at: Date, timeZone = PUSH_TIMEZONE): string {
  const day = at.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
  const time = at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  return `${day}, ${time}`;
}

/** A comment's tab in topic-tabs (the notifications pane's map). */
const TAB_FOR_VISIBILITY: Record<PushCommentVisibility, string> = {
  public: "comments",
  host_only: "host",
  admin_only: "admin",
};

function topicHref(slug: string, topic: PushTopicRef): string | null {
  return topicPath(slug, topic.hostSlug, topic.slug, topic.hostId);
}

function myTopicsCard(slug: string, topicId: string, tab: string): string {
  return `/f/${slug}/my-topics?tab=${tab}&topic=${topicId}#topic-${topicId}`;
}

/** The forum's {host} label ("Faculty" on Newspeak). */
function hostLabel(forum: PushForum): string {
  return forum.settings.roleLabels?.host ?? "Host";
}

const someone = (who: string | null) => who?.trim() || "Someone";

/** Who / where / first line, the link and the per-thread tag. */
export function buildPushPayload(
  candidate: PushCandidate,
  forum: PushForum,
  options: { multiForum: boolean; viewerIsAdmin: boolean },
): PushPayload {
  const slug = forum.slug;
  const suffix = options.multiForum ? forum.name : null;
  const m = candidate.message;
  switch (m.type) {
    case "comment": {
      const tab = TAB_FOR_VISIBILITY[m.visibility];
      const base =
        topicHref(slug, m.topic) ??
        // A slug-less draft: where the notifications pane sends it.
        (options.viewerIsAdmin ? `/f/${slug}/pending` : `/f/${slug}/my-topics`);
      return {
        title: pushTitle({
          who: someone(m.who),
          where: m.topic.title,
          forum: suffix,
        }),
        body: pushBodyLine(m.body),
        url: `${base}?tab=${tab}&topic=${m.topic.id}#comment-${m.commentId}`,
        tag: `topic:${m.topic.id}:${tab}`,
      };
    }
    case "lounge":
      return {
        title: pushTitle({
          who: someone(m.who),
          where: `${hostLabel(forum)} Lounge`,
          forum: suffix,
        }),
        body: pushBodyLine(m.body, { markdown: m.isRoot }),
        url: `/f/${slug}/lounge?c=${m.rootId}&reply=${m.commentId}#comment-${m.commentId}`,
        tag: `lounge:${m.rootId}`,
      };
    case "session": {
      const lead =
        m.action === "confirm"
          ? "Session confirmed"
          : m.action === "clear"
            ? "Session cleared"
            : "Can you make it?";
      const when = pushWhen(m.startsAt);
      return {
        title: withForum(`${lead}: ${m.topic.title}`, suffix),
        body: m.location ? `${when} · ${m.location}` : when,
        url: `/f/${slug}/calendar`,
        tag: `topic:${m.topic.id}:sessions`,
      };
    }
    case "heart":
      return {
        title: withForum(
          `A new ${m.gesture === "heart" ? "❤️" : "💙"} on ${m.topic.title}`,
          suffix,
        ),
        body: "",
        url:
          topicHref(slug, m.topic) ??
          myTopicsCard(slug, m.topic.id, "comments"),
        tag: `topic:${m.topic.id}:${m.gesture}`,
      };
    case "newTopic":
      return {
        title: withForum(`${someone(m.who)} published a topic`, suffix),
        body: pushBodyLine(m.topic.title),
        url: topicHref(slug, m.topic) ?? `/f/${slug}/topics`,
        tag: `topic:${m.topic.id}:new`,
      };
    case "ready":
      return {
        title: withForum(`${someone(m.who)} marked a topic ready`, suffix),
        body: pushBodyLine(m.topic.title),
        url: `/f/${slug}/pending`,
        tag: `topic:${m.topic.id}:ready`,
      };
    case "sentBack":
      return {
        title: withForum(
          `${someone(m.who)} moved your topic back to drafting`,
          suffix,
        ),
        body: pushBodyLine(m.topic.title),
        // The drafting tab must be named: an unvisited pane isn't in the page.
        url: myTopicsCard(slug, m.topic.id, "admin"),
        tag: `topic:${m.topic.id}:admin`,
      };
    case "slotRelease":
      return {
        title: withForum("New dates on the calendar", suffix),
        body:
          m.count === 1
            ? pushWhen(m.firstStartsAt)
            : `${m.count} new dates from ${pushWhen(m.firstStartsAt)}`,
        url: `/f/${slug}/calendar`,
        tag: `calendar:${forum.id}`,
      };
    case "newMember":
      return {
        title: `${someone(m.who)} joined ${forum.name}`,
        body: "",
        url: `/f/${slug}/people`,
        tag: `members:${forum.id}`,
      };
  }
}

function withForum(title: string, forum: string | null): string {
  return forum ? `${title} · ${forum}` : title;
}

/**
 * Candidates → alerts: one per (person, event), decided and worded. A
 * person who qualifies for one event several ways (their topic AND their
 * chain) still gets one alert; the first passing candidate wins.
 */
export function decidePushAlerts(
  candidates: readonly PushCandidate[],
  ctx: PushRecipientContext,
): PushAlert[] {
  const done = new Set<string>();
  const alerts: PushAlert[] = [];
  for (const c of candidates) {
    const key = `${c.userId}\u0000${c.eventKey}`;
    if (done.has(key)) continue;
    const decision = decidePushCandidate(c, ctx);
    if (!decision.send) continue;
    done.add(key);
    const forum = ctx.forum(c.timetableId)!;
    const membership = ctx.membership(c.userId, c.timetableId)!;
    alerts.push({
      userId: c.userId,
      timetableId: c.timetableId,
      kind: decision.kind,
      at: c.at,
      urgency: pushUrgency(decision.kind),
      forum: { slug: forum.slug, name: forum.name },
      payload: buildPushPayload(c, forum, {
        multiForum: ctx.forumCount(c.userId) > 1,
        viewerIsAdmin: isAdmin(membership.roles),
      }),
    });
  }
  return alerts;
}
