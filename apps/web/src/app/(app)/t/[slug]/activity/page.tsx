import Link from "next/link";
import { Fragment } from "react";

import { isAdmin, type Role } from "@timetable/shared";

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
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";
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

/** Primary display role for an actor (highest wins). */
function primaryRole(roles: string[]): string | null {
  if (roles.includes("owner") || roles.includes("admin")) return "admin";
  if (roles.includes("host")) return "host";
  if (roles.includes("elector")) return "elector";
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday of the event's week — the week-grouping key. */
function weekStart(date: Date): Date {
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date.getTime() - day * DAY_MS);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    action?: string;
    actor?: string;
    role?: string;
    from?: string;
    to?: string;
  }>;
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

  const uniqueActions = Array.from(
    new Set(data.activityTimeline.map((e) => e.action)),
  ).sort();
  const uniqueActors = Array.from(
    new Map(
      data.activityTimeline
        .filter((e) => e.actorId)
        .map((e) => [e.actorId as string, { id: e.actorId as string, name: e.actorName }]),
    ).values(),
  ).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const roleOptions = (["admin", "host", "elector"] as const).map((r) => ({
    role: r,
    label: roleLabel(settings.roleLabels, r),
  }));

  const visibleEvents = data.activityTimeline.filter(
    (e) =>
      (!action || e.action === action) &&
      (!actor || e.actorId === actor) &&
      (!role || primaryRole(e.actorRoles) === role),
  );

  // Group into weeks, then days (QA #59). Events arrive newest-first; a
  // heading shows whenever the week/day differs from the previous event's.
  const grouped = visibleEvents.map((event, i) => {
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

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="section-title">Activity log</h2>
        <p>Every moderation and lifecycle action in this timetable.</p>
      </div>
      <div className="toolbar wrap">
        <ActivityFilter value={action ?? ""} actions={uniqueActions} />
        <ActorFilter value={actor ?? ""} actors={uniqueActors} />
        <ActivityRoleFilter value={role ?? ""} options={roleOptions} />
        <ActivityDateFilter from={from ?? ""} to={to ?? ""} />
      </div>
      {visibleEvents.length === 0 ? (
        <EmptyState
          icon="≣"
          title="No activity yet"
          hint="Moderation and lifecycle actions will appear here."
        />
      ) : (
        <div className="timeline">
          {grouped.map(({ event, created, showWeek, showDay }) => {
            const actorRole = primaryRole(event.actorRoles);
            const href = topicPath(slug, event.topicHostSlug, event.topicSlug);
            const commentHref =
              href && event.commentId
                ? `${href}#comment-${event.commentId}`
                : href;

            return (
              <Fragment key={event.id}>
                {showWeek ? (
                  <div className="tl-week">
                    Week of {weekStart(created).toLocaleDateString(undefined, {
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
                <div className={`tl-item${actionClass(event.action)}`}>
                  <div className="tl-when">
                    {created.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="tl-text row" style={{ gap: 8, alignItems: "center" }}>
                    {event.actorId ? (
                      <PersonChip slug={slug} userId={event.actorId}>
                        <Avatar name={event.actorName} small />
                      </PersonChip>
                    ) : (
                      <Avatar name={event.actorName} small />
                    )}
                    <span>
                      {event.actorId ? (
                        <PersonChip slug={slug} userId={event.actorId}>
                          <b>{event.actorName ?? "Someone"}</b>
                        </PersonChip>
                      ) : (
                        <b>{event.actorName ?? "Someone"}</b>
                      )}
                      {actorRole ? (
                        <span className={`pill pill-${actorRole}`} style={{ marginLeft: 6, fontSize: 10 }}>
                          {roleLabel(settings.roleLabels, actorRole)}
                        </span>
                      ) : null}{" "}
                      {describe(event)}
                      {event.invitedEmail ? (
                        <>
                          {" — "}
                          {event.invitedEmail}
                          {event.invitedRoles.length > 0 ? (
                            <span className="faint">
                              {" "}
                              as{" "}
                              {event.invitedRoles
                                .map((r) => roleLabel(settings.roleLabels, r))
                                .join(", ")}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                      {event.topicTitle ? (
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
                      ) : null}
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
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
