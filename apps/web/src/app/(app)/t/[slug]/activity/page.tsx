import { isAdmin, type Role } from "@timetable/shared";

import { ActivityFilter } from "@/components/ActivityFilter";
import type { ActivityEvent } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  timetable: { viewerRoles: string[] } | null;
  activityTimeline: ActivityEvent[];
};

const QUERY = `
  query Activity($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles }
    activityTimeline(idOrSlug: $s) {
      id action note actorName createdAt
    }
  }
`;

const ACTION_LABELS: Record<string, string> = {
  "topic.submit": "submitted a topic",
  "topic.publish": "published a topic",
  "topic.reject": "rejected a topic",
  "topic.unpublish": "unpublished a topic",
  "topic.request_changes": "requested changes",
  "hearts.archive": "archived hearts on a topic",
  "comment.hide": "hid a comment",
};

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
  searchParams: Promise<{ action?: string }>;
}) {
  const { slug } = await params;
  const { action } = await searchParams;
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];

  if (!isAdmin(roles)) {
    return <div className="notice">Admins only.</div>;
  }

  const uniqueActions = Array.from(
    new Set(data.activityTimeline.map((e) => e.action)),
  ).sort();

  const visibleEvents = action
    ? data.activityTimeline.filter((e) => e.action === action)
    : data.activityTimeline;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Activity log</h2>
        <p>Every moderation and lifecycle action in this timetable.</p>
      </div>
      {data.activityTimeline.length > 0 && (
        <ActivityFilter value={action ?? ""} actions={uniqueActions} />
      )}
      {visibleEvents.length === 0 ? (
        <div className="notice">No activity yet.</div>
      ) : (
        <div className="timeline">
          {visibleEvents.map((event) => (
            <div key={event.id} className={`tl-item${actionClass(event.action)}`}>
              <div className="tl-when">{new Date(event.createdAt).toLocaleString()}</div>
              <div className="tl-text">
                <b>{event.actorName ?? "Someone"}</b> {describe(event)}
              </div>
              {event.note ? (
                <div className="tl-note">
                  <span className="tn-by">{event.actorName ?? "Admin"} (admin)</span>
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
