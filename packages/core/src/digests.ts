import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  activityEvents,
  comments,
  db,
  hearts,
  timetableMemberships,
  timetables,
  topics,
  users,
  type NotificationSettings,
} from "@timetable/db";

export type DigestRecipient = {
  id: string;
  email: string | null;
  name: string | null;
  lastDigestAt: Date | null;
  notificationSettings: NotificationSettings;
};

export type UserDigest = {
  userId: string;
  email: string;
  name: string | null;
  /** `path` is a site-relative permalink (/f/{tt}/{host}/{topic}); the
   * mailer prefixes the web origin. Null when slugs are missing. */
  newTopics: { title: string; timetableName: string; path: string | null }[];
  replies: { topicTitle: string; by: string | null; snippet: string }[];
  hostActivity: {
    topicTitle: string;
    kind: "heart" | "comment";
    count: number;
    path: string | null;
  }[];
  assignedTopics: {
    topicTitle: string;
    timetableName: string;
    path: string | null;
  }[];
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
  timetableName: Map<string, string>;
  timetableSlug: Map<string, string>;
  /** The recipient's per-forum slug, by timetable (per-forum profiles). */
  recipientSlugByTimetable: Map<string, string | null>;
  electorTimetableIds: string[];
  isHostSomewhere: boolean;
};

async function loadDigestContext(
  recipient: DigestRecipient,
): Promise<DigestContext> {
  const memberships = await db
    .select({
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
      memberSlug: timetableMemberships.slug,
      name: timetables.name,
      slug: timetables.slug,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

  return {
    recipient,
    timetableName: new Map(memberships.map((m) => [m.timetableId, m.name])),
    timetableSlug: new Map(memberships.map((m) => [m.timetableId, m.slug])),
    recipientSlugByTimetable: new Map(
      memberships.map((m) => [m.timetableId, m.memberSlug]),
    ),
    electorTimetableIds: memberships
      .filter((m) => m.roles.includes("elector"))
      .map((m) => m.timetableId),
    isHostSomewhere: memberships.some((m) => m.roles.includes("host")),
  };
}

async function newTopicsSection(
  ctx: DigestContext,
  since: Date,
): Promise<UserDigest["newTopics"]> {
  const settings = ctx.recipient.notificationSettings;
  if (!settings.digestNewTopics || ctx.electorTimetableIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
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
  return rows.map((r) => ({
    title: r.title,
    timetableName: ctx.timetableName.get(r.timetableId) ?? "",
    path: topicPath(ctx.timetableSlug.get(r.timetableId), r.hostSlug, r.slug),
  }));
}

async function repliesSection(
  ctx: DigestContext,
  since: Date,
): Promise<UserDigest["replies"]> {
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
      by: timetableMemberships.name,
      body: comments.body,
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
        // Moderated-away or author-deleted replies don't get digested
        // (deletedAt added 2026-07-29; hiddenAt was always meant to apply).
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
      ),
    );
  return rows.map((r) => ({
    topicTitle: r.topicTitle,
    by: r.by,
    snippet: r.body.slice(0, 100),
  }));
}

async function hostActivitySection(
  ctx: DigestContext,
  since: Date,
): Promise<UserDigest["hostActivity"]> {
  const settings = ctx.recipient.notificationSettings;
  if (!settings.digestActivity || !ctx.isHostSomewhere) return [];

  const myTopics = await db
    .select({
      id: topics.id,
      title: topics.title,
      slug: topics.slug,
      timetableId: topics.timetableId,
    })
    .from(topics)
    // All statuses: admin comments land on drafts/submissions too
    // (QA #59 round 3) and should reach the owner's digest.
    .where(eq(topics.hostId, ctx.recipient.id));
  const titleById = new Map(myTopics.map((t) => [t.id, t.title]));
  const pathById = new Map(
    myTopics.map((t) => [
      t.id,
      topicPath(
        ctx.timetableSlug.get(t.timetableId),
        ctx.recipientSlugByTimetable.get(t.timetableId),
        t.slug,
      ),
    ]),
  );
  const myTopicIds = myTopics.map((t) => t.id);
  if (myTopicIds.length === 0) return [];

  const [heartRows, commentRows] = await Promise.all([
    db
      .select({ topicId: hearts.topicId, n: sql<number>`count(*)::int` })
      .from(hearts)
      .where(
        and(inArray(hearts.topicId, myTopicIds), gt(hearts.createdAt, since)),
      )
      .groupBy(hearts.topicId),
    db
      .select({ topicId: comments.topicId, n: sql<number>`count(*)::int` })
      .from(comments)
      .where(
        and(
          inArray(comments.topicId, myTopicIds),
          gt(comments.createdAt, since),
          // The owner sees public comments and their admin thread; the
          // Faculty-only thread stays out of email.
          inArray(comments.visibility, ["public", "admin_only"]),
          ne(comments.authorId, ctx.recipient.id),
        ),
      )
      .groupBy(comments.topicId),
  ]);

  const hostActivity: UserDigest["hostActivity"] = [];
  for (const h of heartRows) {
    hostActivity.push({
      topicTitle: titleById.get(h.topicId) ?? "",
      kind: "heart",
      count: h.n,
      path: pathById.get(h.topicId) ?? null,
    });
  }
  for (const c of commentRows) {
    hostActivity.push({
      topicTitle: titleById.get(c.topicId) ?? "",
      kind: "comment",
      count: c.n,
      path: pathById.get(c.topicId) ?? null,
    });
  }
  return hostActivity;
}

/** Topics an admin assigned to this user ("you have a topic") — always
 * included for digest recipients; ownership changes matter regardless of
 * which channels they picked. */
async function assignedTopicsSection(
  ctx: DigestContext,
  since: Date,
): Promise<UserDigest["assignedTopics"]> {
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
      topicTitle: payload?.title ?? "A topic",
      timetableName: ctx.timetableName.get(r.timetableId) ?? "",
      path: topicPath(
        ctx.timetableSlug.get(r.timetableId),
        ctx.recipientSlugByTimetable.get(r.timetableId),
        r.topicSlug,
      ),
    };
  });
}

/**
 * Compute a user's digest for everything since `since`, honoring which channels
 * they enabled. Returns sections that may be empty. The four channel sections
 * are independent reads, so they run concurrently.
 */
export async function computeUserDigest(
  recipient: DigestRecipient,
  since: Date,
): Promise<UserDigest> {
  const ctx = await loadDigestContext(recipient);
  const [newTopics, replies, hostActivity, assignedTopics] = await Promise.all([
    newTopicsSection(ctx, since),
    repliesSection(ctx, since),
    hostActivitySection(ctx, since),
    assignedTopicsSection(ctx, since),
  ]);

  return {
    userId: recipient.id,
    email: recipient.email ?? "",
    name: recipient.name,
    newTopics,
    replies,
    hostActivity,
    assignedTopics,
  };
}

export function isDigestEmpty(digest: UserDigest): boolean {
  return (
    digest.newTopics.length === 0 &&
    digest.replies.length === 0 &&
    digest.hostActivity.length === 0 &&
    digest.assignedTopics.length === 0
  );
}
