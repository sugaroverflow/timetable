import Link from "next/link";

import { isAdmin, type Role } from "@timetable/shared";

import { ActivityRoleFilter } from "@/components/ActivityRoleFilter";
import { ActorFilter } from "@/components/ActorFilter";
import { Avatar } from "@/components/Avatar";
import { DigestSettingsForm } from "@/components/DigestSettingsForm";
import { EmptyState } from "@/components/EmptyState";
import { MarkNotificationsSeen } from "@/components/MarkNotificationsSeen";
import { PersonChip } from "@/components/PersonChip";
import { gqlFetch } from "@/lib/graphql";
import {
  parseDigestSettings,
  parseTimetableSettings,
  roleLabel,
} from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

type Notification = {
  commentId: string;
  kind: "reply" | "comment" | "mention";
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorRoles: string[];
  body: string;
  visibility: string;
  createdAt: string;
  topicTitle: string;
  topicSlug: string | null;
  topicHostSlug: string | null;
};

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  me: { notificationSettings: string } | null;
  notifications: Notification[];
};

const QUERY = `
  query Notifications($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    me { notificationSettings }
    notifications(idOrSlug: $s) {
      commentId kind authorId authorName authorImage authorRoles body
      visibility createdAt topicTitle topicSlug topicHostSlug
    }
  }
`;

function NotificationCard({
  n,
  slug,
  viewerIsAdmin,
}: {
  n: Notification;
  slug: string;
  viewerIsAdmin: boolean;
}) {
  // The permalink renders every comment tier the viewer may see —
  // including the drafting thread for the topic's owner and admins
  // (QA 2026-07-28). Fall back to the thread's list page only when no
  // path builds.
  const base =
    topicPath(slug, n.topicHostSlug, n.topicSlug) ??
    (n.visibility === "admin_only"
      ? `/f/${slug}/${viewerIsAdmin ? "pending" : "my-topics"}`
      : null);
  const href = base ? `${base}#comment-${n.commentId}` : null;
  const replyHref = base
    ? `${base}?reply=${n.commentId}#comment-${n.commentId}`
    : null;
  return (
    <li className="card">
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
            {href ? <Link href={href}>{n.topicTitle}</Link> : n.topicTitle}
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
}

/** Notifications pane (QA #59; sectioned 2026-07-29): a "Settings" section
 * holding the email-digest card, then "Notifications" with user and role
 * filters (same controls as the activity log). Opening the page clears the
 * unread badge. */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ actor?: string; role?: string }>;
}) {
  const { slug } = await params;
  const { actor = "", role = "" } = await searchParams;
  const data = await gqlFetch<Data>(QUERY, { s: slug });

  const viewerRoles = data.timetable?.viewerRoles ?? [];
  if (viewerRoles.length === 0) {
    return <div className="notice">Members only.</div>;
  }
  const viewerIsAdmin = isAdmin(viewerRoles as Role[]);
  const settings = parseTimetableSettings(data.timetable?.settings);

  const authors = [
    ...new Map(
      data.notifications.map((n) => [
        n.authorId,
        { id: n.authorId, name: n.authorName },
      ]),
    ).values(),
  ].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const roleOptions = (["admin", "host", "elector"] as const).map((r) => ({
    role: r,
    label: roleLabel(settings.roleLabels, r),
  }));

  const visible = data.notifications.filter(
    (n) =>
      (!actor || n.authorId === actor) &&
      (!role || n.authorRoles.includes(role)),
  );

  return (
    <div className="stack">
      <MarkNotificationsSeen slug={slug} />
      <div className="page-head">
        <h2 className="page-title">Notifications</h2>
      </div>

      <h3 className="section-title">Settings</h3>
      {/* Email digest preferences live with the notifications they gate
          (QA 2026-07-28 — moved off the profile page). */}
      {data.me ? (
        <DigestSettingsForm
          current={parseDigestSettings(data.me.notificationSettings)}
        />
      ) : null}

      <h3 className="section-title">Notifications</h3>
      {data.notifications.length > 0 ? (
        <div className="toolbar">
          <ActorFilter value={actor} actors={authors} />
          <ActivityRoleFilter value={role} options={roleOptions} />
        </div>
      ) : null}
      {visible.length === 0 ? (
        <EmptyState
          icon="🔔"
          title={data.notifications.length === 0 ? "Nothing yet" : "No matches"}
          hint={
            data.notifications.length === 0
              ? "When someone comments on your topics or replies to you, it shows up here."
              : "No notifications from that person or role — clear the filters to see everything."
          }
        />
      ) : (
        <ul className="list">
          {visible.map((n) => (
            <NotificationCard
              key={n.commentId}
              n={n}
              slug={slug}
              viewerIsAdmin={viewerIsAdmin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
