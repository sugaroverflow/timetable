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
  parseDigestKinds,
  parseDigestSettings,
  parseTimetableSettings,
  roleLabel,
} from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

type Notification = {
  commentId: string;
  kind:
    | "reply"
    | "comment"
    | "mention"
    | "session_pencilled"
    | "session_confirmed"
    | "session_cleared";
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
  timetable: {
    viewerRoles: string[];
    settings: string;
    viewerDigestKinds: string;
  } | null;
  me: { notificationSettings: string } | null;
  notifications: Notification[];
};

const QUERY = `
  query Notifications($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings viewerDigestKinds }
    me { notificationSettings }
    notifications(idOrSlug: $s) {
      commentId kind authorId authorName authorImage authorRoles body
      visibility createdAt topicTitle topicSlug topicHostSlug
    }
  }
`;

const KIND_VERBS: Record<Notification["kind"], string> = {
  reply: "replied to your comment on",
  mention: "mentioned you on",
  comment: "commented on",
  // Calendar v2 (QA 2026-08-03): session events for topics you ❤️'d.
  session_pencilled: "pencilled in a session for",
  session_confirmed: "confirmed a session for",
  session_cleared: "cleared a pencilled session for",
};

function isSessionKind(kind: Notification["kind"]): boolean {
  return kind.startsWith("session_");
}

/** For session notifications, body carries the slot's startsAt ISO. */
function sessionWhen(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day}, ${time}`;
}

/** Link targets per kind. Comment kinds deep-link the topic permalink —
 * which renders every comment tier the viewer may see, including the
 * drafting thread for the topic's owner and admins (QA 2026-07-28) — with
 * the thread's list page as fallback. Session kinds link to the calendar. */
function cardLinks(
  n: Notification,
  slug: string,
  viewerIsAdmin: boolean,
): { href: string | null; replyHref: string | null } {
  if (isSessionKind(n.kind)) {
    return { href: `/f/${slug}/calendar`, replyHref: null };
  }
  const base =
    topicPath(slug, n.topicHostSlug, n.topicSlug) ??
    (n.visibility === "admin_only"
      ? `/f/${slug}/${viewerIsAdmin ? "pending" : "my-topics"}`
      : null);
  if (!base) return { href: null, replyHref: null };
  return {
    href: `${base}#comment-${n.commentId}`,
    replyHref: `${base}?reply=${n.commentId}#comment-${n.commentId}`,
  };
}

function NotificationCard({
  n,
  slug,
  viewerIsAdmin,
}: {
  n: Notification;
  slug: string;
  viewerIsAdmin: boolean;
}) {
  const { href, replyHref } = cardLinks(n, slug, viewerIsAdmin);
  const detail = isSessionKind(n.kind)
    ? sessionWhen(n.body)
    : `“${n.body.slice(0, 160)}”`;
  return (
    <li className="card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <PersonChip slug={slug} userId={n.authorId}>
          <Avatar name={n.authorName} image={n.authorImage} small />
        </PersonChip>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14 }}>
            <PersonChip slug={slug} userId={n.authorId}>
              <b>{n.authorName ?? "Someone"}</b>
            </PersonChip>{" "}
            {KIND_VERBS[n.kind]}{" "}
            {href ? <Link href={href}>{n.topicTitle}</Link> : n.topicTitle}
          </div>
          {detail ? (
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
              {detail}
            </div>
          ) : null}
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

/** The digest card: cadence is the user's, the kind switches are this
 * forum's (per-forum digests, 2026-08-11). */
function DigestCard({ slug, data }: { slug: string; data: Data }) {
  if (!data.me) return null;
  return (
    <DigestSettingsForm
      slug={slug}
      current={parseDigestSettings(data.me.notificationSettings)}
      currentKinds={parseDigestKinds(data.timetable?.viewerDigestKinds)}
    />
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
      <DigestCard slug={slug} data={data} />

      <h3 className="section-title">Notifications</h3>
      {data.notifications.length > 0 ? (
        <div className="toolbar feed-toolbar wrap">
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
