import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import type { NotificationSettings, TimetableSettings } from "@timetable/db";
import {
  activityEvents,
  comments,
  db,
  hearts,
  timetableMemberships,
  timetables,
  topics,
  topicSeen,
  users,
} from "@timetable/db";

export type DigestRecipient = {
  id: string;
  email: string | null;
  name: string | null;
  lastDigestAt: Date | null;
  notificationSettings: NotificationSettings;
};

/**
 * One digest email per (user, forum) — digest v2 (2026-07-29). A member of
 * three forums gets up to three emails, each branded as its forum, each
 * containing only that forum's news.
 */
export type ForumDigest = {
  userId: string;
  email: string;
  name: string | null;
  forumId: string;
  forumName: string;
  forumSlug: string;
  /** The forum theme's primary colour — the email's link/accent colour.
   * Null falls back to the app default. */
  accent: string | null;
  /** Full-text comments on the recipient's topics — the LEAD section. */
  comments: {
    topicTitle: string;
    by: string | null;
    body: string;
    path: string | null;
  }[];
  /** Full-text replies to the recipient's comments. */
  replies: {
    topicTitle: string;
    by: string | null;
    body: string;
    path: string | null;
  }[];
  newTopics: { title: string; path: string | null }[];
  /** ❤️ counts per topic (ambient numbers, not itemised). */
  heartActivity: { topicTitle: string; count: number; path: string | null }[];
  /** The recipient's own unpublished drafts — a standing reminder, shown
   * only when the digest has other content (never the sole reason for an
   * email). */
  drafts: { title: string; path: string | null }[];
  assignedTopics: { topicTitle: string; path: string | null }[];
};

function topicPath(
  timetableSlug: string | null | undefined,
  hostSlug: string | null | undefined,
  topicSlug: string | null | undefined,
): string | null {
  if (!timetableSlug || !hostSlug || !topicSlug) return null;
  return `/f/${timetableSlug}/${hostSlug}/${topicSlug}`;
}

/** Users who have opted into at least one digest channel and have an email. */
export async function listDigestRecipients(): Promise<DigestRecipient[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      lastDigestAt: users.lastDigestAt,
      notificationSettings: users.notificationSettings,
    })
    .from(users);

  return rows.filter((u) => {
    if (!u.email) return false;
    const s = u.notificationSettings;
    return Boolean(s.digestNewTopics || s.digestReplies || s.digestActivity);
  });
}

/** Whether this recipient's digest should go out on `now`'s (UTC) day:
 * daily always; weekly only on their chosen weekday (default Monday). */
export function isDigestDue(
  settings: NotificationSettings,
  now: Date,
): boolean {
  if ((settings.digestFrequency ?? "daily") === "daily") return true;
  return now.getUTCDay() === (settings.digestWeekday ?? 1);
}

/** First-digest lookback when there's no lastDigestAt watermark. */
export function digestWindowDays(settings: NotificationSettings): number {
  return (settings.digestFrequency ?? "daily") === "weekly" ? 7 : 1;
}

export async function markDigestSent(
  userId: string,
  when: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ lastDigestAt: when })
    .where(eq(users.id, userId));
}

/** Everything the per-channel section builders need, loaded once. */
type DigestContext = {
  recipient: DigestRecipient;
  forumIds: string[];
  forumName: Map<string, string>;
  forumSlug: Map<string, string>;
  /** The forum theme's primary colour, for email branding. */
  accent: Map<string, string | null>;
  /** The recipient's per-forum slug, by timetable (per-forum profiles). */
  recipientSlugByTimetable: Map<string, string | null>;
  /** Per-forum "seen it in the app" watermarks (2026-07-29): feed visits
   * cover ambient heart counts; notifications-page visits cover
   * comments/replies. New topics use topic_seen rows instead (deliberate
   * queue reviews), not the superficial feed watermark. */
  seenFeedAt: Map<string, Date | null>;
  seenNotificationsAt: Map<string, Date | null>;
  electorTimetableIds: string[];
  hostTimetableIds: string[];
};

/** The later of the digest window start and an in-app seen watermark. */
function afterSeen(since: Date, seen: Date | null | undefined): Date {
  return seen && seen > since ? seen : since;
}

async function loadDigestContext(
  recipient: DigestRecipient,
): Promise<DigestContext> {
  const memberships = await db
    .select({
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
      memberSlug: timetableMemberships.slug,
      lastSeenFeedAt: timetableMemberships.lastSeenFeedAt,
      lastSeenNotificationsAt: timetableMemberships.lastSeenNotificationsAt,
      name: timetables.name,
      slug: timetables.slug,
      settings: timetables.settings,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

  return {
    recipient,
    forumIds: memberships.map((m) => m.timetableId),
    forumName: new Map(memberships.map((m) => [m.timetableId, m.name])),
    forumSlug: new Map(memberships.map((m) => [m.timetableId, m.slug])),
    accent: new Map(
      memberships.map((m) => [
        m.timetableId,
        (m.settings as TimetableSettings | null)?.theme?.primary ?? null,
      ]),
    ),
    recipientSlugByTimetable: new Map(
      memberships.map((m) => [m.timetableId, m.memberSlug]),
    ),
    seenFeedAt: new Map(
      memberships.map((m) => [m.timetableId, m.lastSeenFeedAt]),
    ),
    seenNotificationsAt: new Map(
      memberships.map((m) => [m.timetableId, m.lastSeenNotificationsAt]),
    ),
    electorTimetableIds: memberships
      .filter((m) => m.roles.includes("elector"))
      .map((m) => m.timetableId),
    hostTimetableIds: memberships
      .filter((m) => m.roles.includes("host"))
      .map((m) => m.timetableId),
  };
}

type PerForum<T> = (T & { timetableId: string })[];

async function newTopicRows(
  ctx: DigestContext,
  since: Date,
): Promise<PerForum<{ title: string; path: string | null }>> {
  if (
    !ctx.recipient.notificationSettings.digestNewTopics ||
    ctx.electorTimetableIds.length === 0
  ) {
    return [];
  }
  const rows = await db
    .select({
      id: topics.id,
      title: topics.title,
      timetableId: topics.timetableId,
      slug: topics.slug,
      hostSlug: timetableMemberships.slug,
    })
    .from(topics)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, topics.hostId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(topics.timetableId, ctx.electorTimetableIds),
        eq(topics.status, "published"),
        gt(topics.publishedAt, since),
      ),
    );
  if (rows.length === 0) return [];

  // "Seen" for a NEW TOPIC means deliberately reviewed — a topic_seen row,
  // written only by the queue's Next button and by hearting. A feed visit
  // is deliberately NOT enough: scrolling All Topics is superficial, the
  // queue is a considered read (Ed, 2026-07-29).
  const seenRows = await db
    .select({ topicId: topicSeen.topicId })
    .from(topicSeen)
    .where(
      and(
        eq(topicSeen.userId, ctx.recipient.id),
        inArray(
          topicSeen.topicId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const seen = new Set(seenRows.map((r) => r.topicId));

  return rows
    .filter((r) => !seen.has(r.id))
    .map((r) => ({
      timetableId: r.timetableId,
      title: r.title,
      path: topicPath(ctx.forumSlug.get(r.timetableId), r.hostSlug, r.slug),
    }));
}

async function replyRows(
  ctx: DigestContext,
  since: Date,
): Promise<PerForum<ForumDigest["replies"][number]>> {
  if (!ctx.recipient.notificationSettings.digestReplies) return [];
  const myComments = await db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.authorId, ctx.recipient.id));
  const myCommentIds = myComments.map((c) => c.id);
  if (myCommentIds.length === 0) return [];

  const rows = await db
    .select({
      topicTitle: topics.title,
      timetableId: topics.timetableId,
      topicSlug: topics.slug,
      by: timetableMemberships.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(comments.parentId, myCommentIds),
        gt(comments.createdAt, since),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );
  return (
    rows
      // Replies live on the Notifications page — a visit there after the
      // reply means it was seen in the app; don't email it.
      .filter(
        (r) =>
          r.createdAt >
          afterSeen(since, ctx.seenNotificationsAt.get(r.timetableId)),
      )
      .map((r) => ({
        timetableId: r.timetableId,
        topicTitle: r.topicTitle,
        by: r.by,
        body: r.body,
        path: null,
      }))
  );
}

/** The recipient's topics across their host forums, with paths. */
async function loadMyTopics(ctx: DigestContext) {
  const myTopics = await db
    .select({
      id: topics.id,
      title: topics.title,
      slug: topics.slug,
      status: topics.status,
      timetableId: topics.timetableId,
    })
    .from(topics)
    // All statuses: admin comments land on drafts/submissions too
    // (QA #59 round 3) and should reach the owner's digest.
    .where(eq(topics.hostId, ctx.recipient.id));
  const pathById = new Map(
    myTopics.map((t) => [
      t.id,
      topicPath(
        ctx.forumSlug.get(t.timetableId),
        ctx.recipientSlugByTimetable.get(t.timetableId),
        t.slug,
      ),
    ]),
  );
  return { myTopics, pathById };
}

/** Full-text comments on the recipient's topics — digest v2's lead
 * section (Ed: "the full text of any comments on my topics"). */
async function commentRowsOnMyTopics(
  ctx: DigestContext,
  since: Date,
  myTopicIds: string[],
  titleById: Map<string, string>,
  pathById: Map<string, string | null>,
  timetableByTopic: Map<string, string>,
): Promise<PerForum<ForumDigest["comments"][number]>> {
  if (myTopicIds.length === 0) return [];
  const rows = await db
    .select({
      topicId: comments.topicId,
      by: timetableMemberships.name,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        inArray(comments.topicId, myTopicIds),
        gt(comments.createdAt, since),
        // The owner sees public comments and their admin thread; the
        // host-only thread stays out of email.
        inArray(comments.visibility, ["public", "admin_only"]),
        ne(comments.authorId, ctx.recipient.id),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );
  return rows
    .filter((r) => {
      const timetableId = timetableByTopic.get(r.topicId) ?? "";
      return (
        r.createdAt > afterSeen(since, ctx.seenNotificationsAt.get(timetableId))
      );
    })
    .map((r) => ({
      timetableId: timetableByTopic.get(r.topicId) ?? "",
      topicTitle: titleById.get(r.topicId) ?? "",
      by: r.by,
      body: r.body,
      path: pathById.get(r.topicId) ?? null,
    }));
}

/** ❤️ counts per topic since the feed watermark (ambient numbers). */
async function heartRowsOnMyTopics(
  ctx: DigestContext,
  since: Date,
  myTopicIds: string[],
  titleById: Map<string, string>,
  pathById: Map<string, string | null>,
  timetableByTopic: Map<string, string>,
): Promise<PerForum<ForumDigest["heartActivity"][number]>> {
  if (myTopicIds.length === 0) return [];
  const rows = await db
    .select({ topicId: hearts.topicId, createdAt: hearts.createdAt })
    .from(hearts)
    .where(
      and(inArray(hearts.topicId, myTopicIds), gt(hearts.createdAt, since)),
    );
  const counts = new Map<string, number>();
  for (const row of rows) {
    const timetableId = timetableByTopic.get(row.topicId) ?? "";
    const cutoff = afterSeen(since, ctx.seenFeedAt.get(timetableId));
    if (row.createdAt <= cutoff) continue;
    counts.set(row.topicId, (counts.get(row.topicId) ?? 0) + 1);
  }
  return [...counts.entries()].map(([topicId, count]) => ({
    timetableId: timetableByTopic.get(topicId) ?? "",
    topicTitle: titleById.get(topicId) ?? "",
    count,
    path: pathById.get(topicId) ?? null,
  }));
}

/** Topics an admin assigned to this user ("you have a topic") — always
 * included for digest recipients; ownership changes matter regardless of
 * which channels they picked. */
async function assignedRows(
  ctx: DigestContext,
  since: Date,
): Promise<PerForum<ForumDigest["assignedTopics"][number]>> {
  const rows = await db
    .select({
      payload: activityEvents.payload,
      timetableId: activityEvents.timetableId,
      topicSlug: topics.slug,
    })
    .from(activityEvents)
    .leftJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .where(
      and(
        eq(activityEvents.action, "topic.reassign"),
        gt(activityEvents.createdAt, since),
        sql`${activityEvents.payload}->>'newHostId' = ${ctx.recipient.id}`,
      ),
    );
  return rows.map((r) => {
    const payload = r.payload as { title?: string } | null;
    return {
      timetableId: r.timetableId,
      topicTitle: payload?.title ?? "A topic",
      path: topicPath(
        ctx.forumSlug.get(r.timetableId),
        ctx.recipientSlugByTimetable.get(r.timetableId),
        r.topicSlug,
      ),
    };
  });
}

function groupByForum<T extends { timetableId: string }>(
  rows: T[],
): Map<string, Omit<T, "timetableId">[]> {
  const grouped = new Map<string, Omit<T, "timetableId">[]>();
  for (const { timetableId, ...rest } of rows) {
    const list = grouped.get(timetableId) ?? [];
    list.push(rest);
    grouped.set(timetableId, list);
  }
  return grouped;
}

/**
 * Digest v2 (2026-07-29): compute one digest PER FORUM the user belongs
 * to, honouring the channels they enabled and the per-forum seen
 * watermarks. Forums with no news yield no digest. Drafts are a standing
 * reminder attached to otherwise non-empty digests only.
 */
export async function computeUserForumDigests(
  recipient: DigestRecipient,
  since: Date,
): Promise<ForumDigest[]> {
  const ctx = await loadDigestContext(recipient);
  const { myTopics, pathById } = await loadMyTopics(ctx);
  const titleById = new Map(myTopics.map((t) => [t.id, t.title]));
  const timetableByTopic = new Map(myTopics.map((t) => [t.id, t.timetableId]));
  const activityOn = Boolean(recipient.notificationSettings.digestActivity);
  const activityTopicIds = activityOn ? myTopics.map((t) => t.id) : [];

  const [newTopics, replies, myComments, heartCounts, assigned] =
    await Promise.all([
      newTopicRows(ctx, since),
      replyRows(ctx, since),
      commentRowsOnMyTopics(
        ctx,
        since,
        activityTopicIds,
        titleById,
        pathById,
        timetableByTopic,
      ),
      heartRowsOnMyTopics(
        ctx,
        since,
        activityTopicIds,
        titleById,
        pathById,
        timetableByTopic,
      ),
      assignedRows(ctx, since),
    ]);

  const byForum = {
    newTopics: groupByForum(newTopics),
    replies: groupByForum(replies),
    comments: groupByForum(myComments),
    hearts: groupByForum(heartCounts),
    assigned: groupByForum(assigned),
  };
  const drafts = groupByForum(
    myTopics
      .filter((t) => t.status === "unpublished")
      .map((t) => ({
        timetableId: t.timetableId,
        title: t.title,
        path: `/f/${ctx.forumSlug.get(t.timetableId) ?? ""}/my-topics`,
      })),
  );

  return ctx.forumIds
    .map((forumId): ForumDigest => {
      return {
        userId: recipient.id,
        email: recipient.email ?? "",
        name: recipient.name,
        forumId,
        forumName: ctx.forumName.get(forumId) ?? "",
        forumSlug: ctx.forumSlug.get(forumId) ?? "",
        accent: ctx.accent.get(forumId) ?? null,
        comments: byForum.comments.get(forumId) ?? [],
        replies: byForum.replies.get(forumId) ?? [],
        newTopics: byForum.newTopics.get(forumId) ?? [],
        heartActivity: byForum.hearts.get(forumId) ?? [],
        drafts: drafts.get(forumId) ?? [],
        assignedTopics: byForum.assigned.get(forumId) ?? [],
      };
    })
    .filter((digest) => !isForumDigestEmpty(digest));
}

/** Empty = nothing to say. Drafts deliberately don't count: a lingering
 * draft alone must never trigger an email. */
export function isForumDigestEmpty(digest: ForumDigest): boolean {
  return (
    digest.comments.length === 0 &&
    digest.replies.length === 0 &&
    digest.newTopics.length === 0 &&
    digest.heartActivity.length === 0 &&
    digest.assignedTopics.length === 0
  );
}
