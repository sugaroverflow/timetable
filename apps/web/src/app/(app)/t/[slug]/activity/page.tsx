import Link from "next/link";
import { Fragment } from "react";

import { isAdmin, primaryRole, type Role } from "@timetable/shared";

import { ActivityDateFilter } from "@/components/ActivityDateFilter";
import { ActivityFilter } from "@/components/ActivityFilter";
import { ActivityRoleFilter } from "@/components/ActivityRoleFilter";
import { ActorFilter } from "@/components/ActorFilter";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { PersonChip } from "@/components/PersonChip";
import { ACTION_LABELS } from "@/lib/activityLabels";
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
    timetable(idOrSlug: $s) { viewerRoles settings }
    activityTimeline(idOrSlug: $s, from: $from, to: $to) {
      id action note actorId actorName actorImage actorRoles createdAt
      topicTitle topicSlug topicHostSlug topicHostName snippet
      commentId invitedEmail invitedRoles
    }
  }
`;

function describe(event: ActivityEvent): string {
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

function TopicSuffix({ event, slug }: { event: ActivityEvent; slug: string }) {
  if (!event.topicTitle) return null;
  const href = topicPath(slug, event.topicHostSlug, event.topicSlug);
  const commentHref =
    href && event.commentId ? `${href}#comment-${event.commentId}` : href;
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
  const actorRole = actorPrimaryRole(event.actorRoles);
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
          <Avatar name={event.actorName} small />
        </ChipWrap>
        <span>
          <ChipWrap slug={slug} actorId={event.actorId}>
            <b>{event.actorName ?? "Someone"}</b>
          </ChipWrap>
          {actorRole ? (
            <span
              className={`pill pill-${actorRole}`}
              style={{ marginLeft: 6, fontSize: 10 }}
            >
              {roleLabel(roleLabels, actorRole)}
            </span>
          ) : null}{" "}
          {describe(event)}
          <InvitedSuffix event={event} roleLabels={roleLabels} />
          <TopicSuffix event={event} slug={slug} />
        </span>
      </div>
      {event.snippet ? (
        <div className="tl-note">&ldquo;{event.snippet}&rdquo;</div>
      ) : null}
      {event.note ? (
        <div className="tl-note">
          <span className="tn-by">
            {event.actorName ?? adminLabel} ({adminLabel.toLowerCase()})
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
    <div className="toolbar wrap">
      <ActivityFilter value={filters.action ?? ""} actions={uniqueActions} />
      <ActorFilter value={filters.actor ?? ""} actors={uniqueActors} />
      <ActivityRoleFilter value={filters.role ?? ""} options={roleOptions} />
      <ActivityDateFilter from={filters.from ?? ""} to={filters.to ?? ""} />
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
        <h2 className="section-title">Activity log</h2>
        <p>Every moderation and lifecycle action in this forum.</p>
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
          hint="Moderation and lifecycle actions will appear here."
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
