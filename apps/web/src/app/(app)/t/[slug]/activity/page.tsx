import Link from "next/link";

import { isAdmin, type Role } from "@timetable/shared";

import { ActivityFilter } from "@/components/ActivityFilter";
import { ActorFilter } from "@/components/ActorFilter";
import { EmptyState } from "@/components/EmptyState";
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
  query Activity($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings }
    activityTimeline(idOrSlug: $s) {
      id action note actorId actorName createdAt
      topicTitle topicSlug topicHostSlug snippet
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

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ action?: string; actor?: string }>;
}) {
  const { slug } = await params;
  const { action, actor } = await searchParams;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
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

  const visibleEvents = data.activityTimeline.filter(
    (e) =>
      (!action || e.action === action) && (!actor || e.actorId === actor),
  );

  return (
    <div className="stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Activity log</h2>
        <p>Every moderation and lifecycle action in this timetable.</p>
      </div>
      {data.activityTimeline.length > 0 && (
        <div className="toolbar">
          <ActivityFilter value={action ?? ""} actions={uniqueActions} />
          <ActorFilter value={actor ?? ""} actors={uniqueActors} />
        </div>
      )}
      {visibleEvents.length === 0 ? (
        <EmptyState
          icon="≣"
          title="No activity yet"
          hint="Moderation and lifecycle actions will appear here."
        />
      ) : (
        <div className="timeline">
          {visibleEvents.map((event) => (
            <div key={event.id} className={`tl-item${actionClass(event.action)}`}>
              <div className="tl-when">{new Date(event.createdAt).toLocaleString()}</div>
              <div className="tl-text">
                <b>{event.actorName ?? "Someone"}</b> {describe(event)}
                {event.topicTitle ? (
                  <>
                    {" — "}
                    {(() => {
                      const href = topicPath(
                        slug,
                        event.topicHostSlug,
                        event.topicSlug,
                      );
                      return href ? (
                        <Link href={href}>{event.topicTitle}</Link>
                      ) : (
                        event.topicTitle
                      );
                    })()}
                  </>
                ) : null}
              </div>
              {event.snippet ? (
                <div className="tl-note">&ldquo;{event.snippet}&rdquo;</div>
              ) : null}
              {event.note ? (
                <div className="tl-note">
                  <span className="tn-by">
                    {event.actorName ?? adminLabel} ({adminLabel.toLowerCase()})
                  </span>
                  <br />{event.note}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
