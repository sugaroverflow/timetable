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
        <ul className="list">
          {visibleEvents.map((event) => (
            <li key={event.id} className="card">
              <div className="row wrap" style={{ justifyContent: "space-between" }}>
                <span>
                  <strong>{event.actorName ?? "Someone"}</strong>{" "}
                  {describe(event)}
                </span>
                <span className="faint mono" style={{ fontSize: 12 }}>
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
              {event.note ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  {event.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
