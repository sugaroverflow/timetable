import Link from "next/link";

import { isAdmin, type Role } from "@timetable/shared";

import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { MarkNotificationsSeen } from "@/components/MarkNotificationsSeen";
import { PersonChip } from "@/components/PersonChip";
import { gqlFetch } from "@/lib/graphql";
import { topicPath } from "@/lib/topicPath";

type Notification = {
  commentId: string;
  kind: "reply" | "comment" | "mention";
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
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
    timetable: forum(idOrSlug: $s) { viewerRoles }
    notifications(idOrSlug: $s) {
      commentId kind authorId authorName authorImage body visibility createdAt
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
  const viewerIsAdmin = isAdmin(viewerRoles as Role[]);

  return (
    <div className="stack">
      <MarkNotificationsSeen slug={slug} />
      <div className="page-head">
        <h2 className="section-title">Notifications</h2>
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
            // The permalink renders every comment tier the viewer may see —
            // including the drafting thread for the topic's owner and
            // admins (QA 2026-07-28; hosts used to be sent to All Topics,
            // where their unpublished topic doesn't render at all). Fall
            // back to the thread's list page only when no path builds.
            const base =
              topicPath(slug, n.topicHostSlug, n.topicSlug) ??
              (n.visibility === "admin_only"
                ? `/f/${slug}/${viewerIsAdmin ? "moderation" : "my-topics"}`
                : null);
            const href = base ? `${base}#comment-${n.commentId}` : null;
            const replyHref = base
              ? `${base}?reply=${n.commentId}#comment-${n.commentId}`
              : null;
            return (
              <li key={n.commentId} className="card">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <PersonChip slug={slug} userId={n.authorId}>
                    <Avatar name={n.authorName} image={n.authorImage} small />
                  </PersonChip>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>
                      <b>{n.authorName ?? "Someone"}</b>{" "}
                      {n.kind === "reply"
                        ? "replied to your comment on"
                        : n.kind === "mention"
                          ? "mentioned you on"
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
                    <div
                      className="faint"
                      style={{ fontSize: 11, marginTop: 2 }}
                    >
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
