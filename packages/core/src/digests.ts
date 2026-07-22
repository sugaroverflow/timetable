import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";

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
  /** `path` is a site-relative permalink (/t/{tt}/{host}/{topic}); the
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
  return `/t/${timetableSlug}/${hostSlug}/${topicSlug}`;
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
      slug: timetables.slug,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, recipient.id));

  const timetableName = new Map(
    memberships.map((m) => [m.timetableId, m.name]),
  );
  const timetableSlug = new Map(
    memberships.map((m) => [m.timetableId, m.slug]),
  );
  const [recipientRow] = await db
    .select({ slug: users.slug })
    .from(users)
    .where(eq(users.id, recipient.id))
    .limit(1);
  const recipientSlug = recipientRow?.slug ?? null;
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
        slug: topics.slug,
        hostSlug: users.slug,
      })
      .from(topics)
      .innerJoin(users, eq(users.id, topics.hostId))
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
        path: topicPath(timetableSlug.get(r.timetableId), r.hostSlug, r.slug),
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
      .select({
        id: topics.id,
        title: topics.title,
        slug: topics.slug,
        timetableId: topics.timetableId,
      })
      .from(topics)
      // All statuses: admin comments land on drafts/submissions too
      // (QA #59 round 3) and should reach the owner's digest.
      .where(eq(topics.hostId, recipient.id));
    const titleById = new Map(myTopics.map((t) => [t.id, t.title]));
    const pathById = new Map(
      myTopics.map((t) => [
        t.id,
        topicPath(timetableSlug.get(t.timetableId), recipientSlug, t.slug),
      ]),
    );
    const myTopicIds = myTopics.map((t) => t.id);
    if (myTopicIds.length > 0) {
      const heartRows = await db
        .select({ topicId: hearts.topicId, n: sql<number>`count(*)::int` })
        .from(hearts)
        .where(
          and(inArray(hearts.topicId, myTopicIds), gt(hearts.createdAt, since)),
        )
        .groupBy(hearts.topicId);
      const commentRows = await db
        .select({ topicId: comments.topicId, n: sql<number>`count(*)::int` })
        .from(comments)
        .where(
          and(
            inArray(comments.topicId, myTopicIds),
            gt(comments.createdAt, since),
            // The owner sees public comments and their admin thread; the
            // Faculty-only thread stays out of email.
            inArray(comments.visibility, ["public", "admin_only"]),
            ne(comments.authorId, recipient.id),
          ),
        )
        .groupBy(comments.topicId);
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
    }
  }

  // Topics an admin assigned to this user ("you have a topic") — always
  // included for digest recipients; ownership changes matter regardless of
  // which channels they picked.
  const assignedTopics: UserDigest["assignedTopics"] = [];
  {
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
          sql`${activityEvents.payload}->>'newHostId' = ${recipient.id}`,
        ),
      );
    for (const r of rows) {
      const payload = r.payload as { title?: string } | null;
      assignedTopics.push({
        topicTitle: payload?.title ?? "A topic",
        timetableName: timetableName.get(r.timetableId) ?? "",
        path: topicPath(
          timetableSlug.get(r.timetableId),
          recipientSlug,
          r.topicSlug,
        ),
      });
    }
  }

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
