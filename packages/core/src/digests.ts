import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";

import {
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
  newTopics: { title: string; timetableName: string }[];
  replies: { topicTitle: string; by: string | null; snippet: string }[];
  hostActivity: { topicTitle: string; kind: "heart" | "comment"; count: number }[];
};

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

export async function markDigestSent(userId: string, when: Date): Promise<void> {
  await db
    .update(users)
    .set({ lastDigestAt: when })
    .where(eq(users.id, userId));
}

/**
 * Compute a user's digest for everything since `since`, honoring which channels
 * they enabled. Returns sections that may be empty.
 */
export async function computeUserDigest(
  recipient: DigestRecipient,
  since: Date,
): Promise<UserDigest> {
  const settings = recipient.notificationSettings;

  const memberships = await db
    .select({
      timetableId: timetableMemberships.timetableId,
      roles: timetableMemberships.roles,
      name: timetables.name,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

  const timetableName = new Map(memberships.map((m) => [m.timetableId, m.name]));
  const electorTimetableIds = memberships
    .filter((m) => m.roles.includes("elector"))
    .map((m) => m.timetableId);
  const isHostSomewhere = memberships.some((m) => m.roles.includes("host"));

  const newTopics: UserDigest["newTopics"] = [];
  if (settings.digestNewTopics && electorTimetableIds.length > 0) {
    const rows = await db
      .select({
        title: topics.title,
        timetableId: topics.timetableId,
      })
      .from(topics)
      .where(
        and(
          inArray(topics.timetableId, electorTimetableIds),
          eq(topics.status, "published"),
          gt(topics.publishedAt, since),
        ),
      );
    for (const r of rows) {
      newTopics.push({
        title: r.title,
        timetableName: timetableName.get(r.timetableId) ?? "",
      });
    }
  }

  const replies: UserDigest["replies"] = [];
  if (settings.digestReplies) {
    const myComments = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.authorId, recipient.id));
    const myCommentIds = myComments.map((c) => c.id);
    if (myCommentIds.length > 0) {
      const rows = await db
        .select({
          topicTitle: topics.title,
          by: users.name,
          body: comments.body,
        })
        .from(comments)
        .innerJoin(topics, eq(topics.id, comments.topicId))
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(
          and(
            inArray(comments.parentId, myCommentIds),
            gt(comments.createdAt, since),
            ne(comments.authorId, recipient.id),
          ),
        );
      for (const r of rows) {
        replies.push({
          topicTitle: r.topicTitle,
          by: r.by,
          snippet: r.body.slice(0, 100),
        });
      }
    }
  }

  const hostActivity: UserDigest["hostActivity"] = [];
  if (settings.digestActivity && isHostSomewhere) {
    const myTopics = await db
      .select({ id: topics.id, title: topics.title })
      .from(topics)
      .where(and(eq(topics.hostId, recipient.id), eq(topics.status, "published")));
    const titleById = new Map(myTopics.map((t) => [t.id, t.title]));
    const myTopicIds = myTopics.map((t) => t.id);
    if (myTopicIds.length > 0) {
      const heartRows = await db
        .select({ topicId: hearts.topicId, n: sql<number>`count(*)::int` })
        .from(hearts)
        .where(and(inArray(hearts.topicId, myTopicIds), gt(hearts.createdAt, since)))
        .groupBy(hearts.topicId);
      const commentRows = await db
        .select({ topicId: comments.topicId, n: sql<number>`count(*)::int` })
        .from(comments)
        .where(
          and(
            inArray(comments.topicId, myTopicIds),
            gt(comments.createdAt, since),
            eq(comments.visibility, "public"),
          ),
        )
        .groupBy(comments.topicId);
      for (const h of heartRows) {
        hostActivity.push({
          topicTitle: titleById.get(h.topicId) ?? "",
          kind: "heart",
          count: h.n,
        });
      }
      for (const c of commentRows) {
        hostActivity.push({
          topicTitle: titleById.get(c.topicId) ?? "",
          kind: "comment",
          count: c.n,
        });
      }
    }
  }

  return {
    userId: recipient.id,
    email: recipient.email ?? "",
    name: recipient.name,
    newTopics,
    replies,
    hostActivity,
  };
}

export function isDigestEmpty(digest: UserDigest): boolean {
  return (
    digest.newTopics.length === 0 &&
    digest.replies.length === 0 &&
    digest.hostActivity.length === 0
  );
}
