import Link from "next/link";
import { Fragment } from "react";

import { isAdmin, primaryRole, type Role } from "@timetable/shared";

import { ActivityDateFilter } from "@/components/ActivityDateFilter";
import { ActivityFilter } from "@/components/ActivityFilter";
import { ActivityRoleFilter } from "@/components/ActivityRoleFilter";
import { ActorFilter } from "@/components/ActorFilter";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { LiveLogSync } from "@/components/LiveLogSync";
import { PersonChip } from "@/components/PersonChip";
import { PrimaryRolePill } from "@/components/RolePills";
import {
  ACTION_LABELS,
  AVAILABILITY_EMOJI,
  TARGETED_LABELS,
} from "@/lib/activityLabels";
import type { ActivityEvent } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  roleLabel,
  type RoleLabels,
} from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  activityTimeline: ActivityEvent[];
};

const QUERY = `
  query Activity($s: String!, $from: String, $to: String) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    activityTimeline(idOrSlug: $s, from: $from, to: $to) {
      id action note actorId actorName actorImage actorRoles createdAt
      topicTitle topicSlug topicHostSlug topicHostName snippet
      commentId invitedEmail invitedRoles
      targetUserId targetName targetRoles rolesTo
      slotId slotStartsAt availabilityState location
    }
  }
`;

/** The verb phrase after the actor's name. Events with a named target use
 * the connective variant ("previewed the forum as") so TargetSuffix
 * completes the sentence; everything else gets the generic label. */
function describe(event: ActivityEvent): string {
  if (event.targetName && TARGETED_LABELS[event.action]) {
    return TARGETED_LABELS[event.action] as string;
  }
  return ACTION_LABELS[event.action] ?? event.action;
}

function actionClass(action: string): string {
  if (action === "topic.publish") return " act-pub";
  if (action === "comment.hide") return " act-hide";
  return "";
}

/** Primary display role for an actor (highest wins); roleless actors get
 * no role pill and never match the role filter. */
function actorPrimaryRole(roles: string[]): string | null {
  return roles.length > 0 ? primaryRole(roles as Role[]) : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday of the event's week — the week-grouping key. */
function weekStart(date: Date): Date {
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date.getTime() - day * DAY_MS);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Options for the three dropdown filters, derived from the full timeline
 * (not the filtered view, so narrowing one filter doesn't shrink the rest). */
function filterOptions(timeline: ActivityEvent[], roleLabels?: RoleLabels) {
  const uniqueActions = Array.from(
    new Set(timeline.map((e) => e.action)),
  ).sort();
  const uniqueActors = Array.from(
    new Map(
      timeline
        .filter((e) => e.actorId)
        .map((e) => [
          e.actorId as string,
          { id: e.actorId as string, name: e.actorName },
        ]),
    ).values(),
  ).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const roleOptions = (["admin", "host", "elector"] as const).map((r) => ({
    role: r,
    label: roleLabel(roleLabels, r),
  }));
  return { uniqueActions, uniqueActors, roleOptions };
}

// Group into weeks, then days (QA #59). Events arrive newest-first; a
// heading shows whenever the week/day differs from the previous event's.
function groupByWeekAndDay(visibleEvents: ActivityEvent[]) {
  return visibleEvents.map((event, i) => {
    const created = new Date(event.createdAt);
    const prevEvent = i > 0 ? visibleEvents[i - 1] : undefined;
    const prev = prevEvent ? new Date(prevEvent.createdAt) : null;
    const showWeek =
      !prev ||
      weekStart(created).toDateString() !== weekStart(prev).toDateString();
    const showDay =
      showWeek || !prev || created.toDateString() !== prev.toDateString();
    return { event, created, showWeek, showDay };
  });
}

/** PersonChip when the actor is a known member, bare content otherwise. */
function ChipWrap({
  slug,
  actorId,
  children,
}: {
  slug: string;
  actorId: string | null;
  children: React.ReactNode;
}) {
  return actorId ? (
    <PersonChip slug={slug} userId={actorId}>
      {children}
    </PersonChip>
  ) : (
    <>{children}</>
  );
}

function InvitedSuffix({
  event,
  roleLabels,
}: {
  event: ActivityEvent;
  roleLabels?: RoleLabels;
}) {
  if (!event.invitedEmail) return null;
  return (
    <>
      {" — "}
      {event.invitedEmail}
      {event.invitedRoles.length > 0 ? (
        <span className="faint">
          {" "}
          as{" "}
          {event.invitedRoles.map((r) => roleLabel(roleLabels, r)).join(", ")}
        </span>
      ) : null}
    </>
  );
}

/** The member an admin action was done TO — a linked name chip with their
 * role at event time, completing the TARGETED_LABELS sentence. Role
 * changes append the roles the member ended up with (Ed, 2026-08-17). */
function TargetSuffix({
  event,
  slug,
  roleLabels,
}: {
  event: ActivityEvent;
  slug: string;
  roleLabels?: RoleLabels;
}) {
  if (!event.targetName || !TARGETED_LABELS[event.action]) return null;
  return (
    <>
      {" "}
      <ChipWrap slug={slug} actorId={event.targetUserId}>
        <b>{event.targetName}</b>
      </ChipWrap>
      <PrimaryRolePill roles={event.targetRoles} labels={roleLabels} />
      {event.action === "member.role_change" && event.rolesTo.length > 0 ? (
        <span className="faint">
          {" "}
          to {event.rolesTo.map((r) => roleLabel(roleLabels, r)).join(", ")}
        </span>
      ) : null}
      {event.action === "member.remove" ? " from the forum" : null}
    </>
  );
}

/** Same shape as the calendar page's isPast — a plain helper, since the
 * react-compiler rule bars Date.now() inside component render. */
function slotInPast(at: Date): boolean {
  return at.getTime() < Date.now();
}

/** The timeslot a calendar event refers to, linked to its calendar row
 * (past slots route through ?past=1 so the row is actually shown).
 * availability.set leads with the 🟢🟡🔴 answer. */
function SlotSuffix({ event, slug }: { event: ActivityEvent; slug: string }) {
  if (!event.slotStartsAt) return null;
  const at = new Date(event.slotStartsAt);
  const label = at.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const past = slotInPast(at);
  const href = event.slotId
    ? `/f/${slug}/calendar${past ? "?past=1" : ""}#slot-${event.slotId}`
    : null;
  const emoji = event.availabilityState
    ? AVAILABILITY_EMOJI[event.availabilityState]
    : null;
  return (
    <>
      {emoji ? ` ${emoji}` : null}
      {/* "at" when a topic already anchored the sentence, dash otherwise. */}
      {event.topicTitle ? " at " : " — "}
      {href ? <Link href={href}>{label}</Link> : label}
      {event.location ? (
        <span className="faint"> ({event.location})</span>
      ) : null}
    </>
  );
}

/** Deep link for the event's topic — anchored to the comment when the
 * event names one. Shared by the topic-title link and the snippet quote
 * (Ed, 2026-08-17: the quote is the natural click target). */
function topicOrCommentHref(event: ActivityEvent, slug: string) {
  const href = topicPath(slug, event.topicHostSlug, event.topicSlug);
  return href && event.commentId ? `${href}#comment-${event.commentId}` : href;
}

function TopicSuffix({ event, slug }: { event: ActivityEvent; slug: string }) {
  if (!event.topicTitle) return null;
  const commentHref = topicOrCommentHref(event, slug);
  return (
    <>
      {" — "}
      {commentHref ? (
        <Link href={commentHref}>{event.topicTitle}</Link>
      ) : (
        event.topicTitle
      )}
      {event.topicHostName ? (
        <span className="faint"> ({event.topicHostName})</span>
      ) : null}
    </>
  );
}

/** The quoted comment/body text, linked to the comment itself when the
 * event carries one (unstyled-link class keeps the quiet quote look). */
function SnippetQuote({ event, slug }: { event: ActivityEvent; slug: string }) {
  const href = topicOrCommentHref(event, slug);
  const quote = <>&ldquo;{event.snippet}&rdquo;</>;
  return href ? (
    <Link className="tl-quote-link" href={href}>
      {quote}
    </Link>
  ) : (
    quote
  );
}

function TimelineItem({
  event,
  created,
  slug,
  roleLabels,
  adminLabel,
}: {
  event: ActivityEvent;
  created: Date;
  slug: string;
  roleLabels?: RoleLabels;
  adminLabel: string;
}) {
  return (
    <div className={`tl-item${actionClass(event.action)}`}>
      <div className="tl-when">
        {created.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className="tl-text row" style={{ gap: 8, alignItems: "center" }}>
        <ChipWrap slug={slug} actorId={event.actorId}>
          <Avatar name={event.actorName} image={event.actorImage} small />
        </ChipWrap>
        <span>
          <ChipWrap slug={slug} actorId={event.actorId}>
            <b>{event.actorName ?? "Someone"}</b>
          </ChipWrap>
          <PrimaryRolePill roles={event.actorRoles} labels={roleLabels} />{" "}
          {describe(event)}
          <TargetSuffix event={event} slug={slug} roleLabels={roleLabels} />
          <InvitedSuffix event={event} roleLabels={roleLabels} />
          <TopicSuffix event={event} slug={slug} />
          <SlotSuffix event={event} slug={slug} />
        </span>
      </div>
      {event.snippet ? (
        <div className="tl-note">
          {/* The quote links where the title does — straight to the
              comment when the event names one. */}
          <SnippetQuote event={event} slug={slug} />
        </div>
      ) : null}
      {event.note ? (
        <div className="tl-note">
          <span className="tn-by">
            {/* The actor's real role — slot-discussion notes come from any
                member, so the old hardcoded "(admin)" often lied. */}
            {event.actorName ?? adminLabel} (
            {(
              roleLabel(roleLabels, actorPrimaryRole(event.actorRoles) ?? "") ||
              adminLabel
            ).toLowerCase()}
            )
          </span>
          <br />
          {event.note}
        </div>
      ) : null}
    </div>
  );
}

type Filters = {
  action?: string;
  actor?: string;
  role?: string;
  from?: string;
  to?: string;
};

function ActivityToolbar({
  filters,
  timeline,
  roleLabels,
}: {
  filters: Filters;
  timeline: ActivityEvent[];
  roleLabels?: RoleLabels;
}) {
  const { uniqueActions, uniqueActors, roleOptions } = filterOptions(
    timeline,
    roleLabels,
  );
  return (
    <div className="toolbar feed-toolbar wrap">
      <ActivityRoleFilter value={filters.role ?? ""} options={roleOptions} />
      <ActorFilter value={filters.actor ?? ""} actors={uniqueActors} />
      <ActivityFilter value={filters.action ?? ""} actions={uniqueActions} />
      <ActivityDateFilter from={filters.from ?? ""} to={filters.to ?? ""} />
      <LiveLogSync />
    </div>
  );
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Filters>;
}) {
  const { slug } = await params;
  const { action, actor, role, from, to } = await searchParams;
  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    from: from || null,
    to: to || null,
  });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const adminLabel = roleLabel(settings.roleLabels, "admin");

  if (!isAdmin(roles)) {
    return <div className="notice">{adminLabel}s only.</div>;
  }

  const visibleEvents = data.activityTimeline.filter(
    (e) =>
      (!action || e.action === action) &&
      (!actor || e.actorId === actor) &&
      (!role || actorPrimaryRole(e.actorRoles) === role),
  );

  const grouped = groupByWeekAndDay(visibleEvents);

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">Activity log</h2>
      </div>
      <ActivityToolbar
        filters={{ action, actor, role, from, to }}
        timeline={data.activityTimeline}
        roleLabels={settings.roleLabels}
      />
      {visibleEvents.length === 0 ? (
        <EmptyState
          icon="≣"
          title="No activity yet"
          hint="Review and lifecycle actions will appear here."
        />
      ) : (
        <div className="timeline">
          {grouped.map(({ event, created, showWeek, showDay }) => (
            <Fragment key={event.id}>
              {showWeek ? (
                <div className="tl-week">
                  Week of{" "}
                  {weekStart(created).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              ) : null}
              {showDay ? (
                <div className="tl-day">
                  {created.toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </div>
              ) : null}
              <TimelineItem
                event={event}
                created={created}
                slug={slug}
                roleLabels={settings.roleLabels}
                adminLabel={adminLabel}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
