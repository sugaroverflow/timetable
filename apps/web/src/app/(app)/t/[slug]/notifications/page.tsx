import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { MarkNotificationsSeen } from "@/components/MarkNotificationsSeen";
import { PersonChip } from "@/components/PersonChip";
import { gqlFetch } from "@/lib/graphql";
import { topicPath } from "@/lib/topicPath";

type Notification = {
  commentId: string;
  kind: "reply" | "comment";
  authorId: string;
  authorName: string | null;
  body: string;
  visibility: string;
  createdAt: string;
  topicTitle: string;
  topicSlug: string | null;
  topicHostSlug: string | null;
};

type Data = {
  timetable: { viewerRoles: string[] } | null;
  notifications: Notification[];
};

const QUERY = `
  query Notifications($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles }
    notifications(idOrSlug: $s) {
      commentId kind authorId authorName body visibility createdAt
      topicTitle topicSlug topicHostSlug
    }
  }
`;

/** Minimal notifications pane (QA #59): comments on your topics and replies
 * to your comments, newest first. Opening it clears the unread badge. */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug });

  const viewerRoles = data.timetable?.viewerRoles ?? [];
  if (viewerRoles.length === 0) {
    return <div className="notice">Members only.</div>;
  }
  const viewerIsAdmin =
    viewerRoles.includes("admin") || viewerRoles.includes("owner");

  return (
    <div className="stack">
      <MarkNotificationsSeen slug={slug} />
      <div className="page-head">
        <h2 style={{ fontSize: 18, margin: 0 }}>Notifications</h2>
        <p>Comments on your topics and replies to your comments.</p>
      </div>
      {data.notifications.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="Nothing yet"
          hint="When someone comments on your topics or replies to you, it shows up here."
        />
      ) : (
        <ul className="list">
          {data.notifications.map((n) => {
            // Admin-thread comments never render on the feed permalink —
            // their home is My Topics (owner) or Pending Topics (admins).
            const base =
              n.visibility === "admin_only"
                ? `/t/${slug}/${viewerIsAdmin ? "moderation" : "topics"}`
                : topicPath(slug, n.topicHostSlug, n.topicSlug);
            const href = base ? `${base}#comment-${n.commentId}` : null;
            const replyHref = base
              ? `${base}?reply=${n.commentId}#comment-${n.commentId}`
              : null;
            return (
              <li key={n.commentId} className="card">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <PersonChip slug={slug} userId={n.authorId}>
                    <Avatar name={n.authorName} small />
                  </PersonChip>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>
                      <b>{n.authorName ?? "Someone"}</b>{" "}
                      {n.kind === "reply"
                        ? "replied to your comment on"
                        : "commented on"}{" "}
                      {href ? (
                        <Link href={href}>{n.topicTitle}</Link>
                      ) : (
                        n.topicTitle
                      )}
                    </div>
                    <div
                      className="faint"
                      style={{
                        fontSize: 13,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      &ldquo;{n.body.slice(0, 160)}&rdquo;
                    </div>
                    <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span style={{ flex: 1 }} />
                  {replyHref ? (
                    <Link className="btn btn-ghost" href={replyHref}>
                      Reply
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
