import type { Topic } from "@timetable/db";
import {
  canModerate,
  canProposeTopics,
  canSeeHostOnly,
  canSeePersonProfile,
  type Privacy,
  type Role,
  type Viewer,
} from "@timetable/shared";

import { listCommentTreesForTopics, type CommentNode } from "./comments";
import { listHeartEvents, type HeartEvent } from "./heartEvents";
import { listPeople } from "./members";
import {
  buildFeed,
  listHostTopics,
  listSubmittedTopics,
  loadPublishedHearts,
} from "./topics";

/**
 * The read-only data export behind GET /api/forums/:id/export and the
 * forum's "API" page: everything the viewer's role can already read in the
 * app, as one timestamped JSON document. Role filtering reuses the same
 * shared permission checks as the GraphQL resolvers. Timeslot/calendar data
 * is not included yet — adding it is an open todo (docs/PRODUCT.md, Known
 * gaps).
 */

export type ExportTopic = {
  id: string;
  title: string;
  slug: string | null;
  hostId: string;
  hostName: string | null;
  status: string;
  bodyMd: string;
  coverImageUrl: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  contentUpdatedAt: Date | null;
  heartCount: number;
  weightedScore: number;
  l2Score?: number;
  devotionScore?: number;
  /** User ids currently hearting this topic (post-cutoff). */
  hearts: string[];
  comments: CommentNode[];
};

export type ExportPerson = {
  userId: string;
  name: string | null;
  slug: string | null;
  bio: string | null;
  roles: Role[];
  publishedTopics: { id: string; title: string; slug: string | null }[];
};

export type ExportManagedTopic = {
  id: string;
  title: string;
  slug: string | null;
  hostId: string;
  status: string;
  bodyMd: string;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  comments: CommentNode[];
};

export type DataExport = {
  readme: string;
  forum: {
    name: string;
    slug: string;
    exportedAt: string;
    viewerRoles: Role[];
  };
  topics: ExportTopic[];
  people: ExportPerson[];
  /** Hosts/admins: the viewer's own topics across all statuses. */
  myTopics?: ExportManagedTopic[];
  /** Admins: submitted topics awaiting review. */
  pendingTopics?: ExportManagedTopic[];
  /** Admins: the append-only ❤️/💙 ledger, oldest first. Unlike `hearts`
   * on each topic (current, post-cutoff state), this history survives
   * un-hearts and cutoff resets. */
  heartEvents?: HeartEvent[];
};

const README = [
  "Read-only export from Topic (topic.forum). Contents are filtered to what",
  "the exporting user's roles can access; all timestamps are ISO 8601 UTC.",
  "Keys: `forum` — forum metadata, export time, and the roles this export",
  "was filtered by. `topics` — published topics with body markdown, heart",
  "counts, weighted scores, the user ids currently hearting each topic",
  "(`hearts`), and comment threads (each comment carries a `visibility` of",
  "public, host_only, or admin_only). `people` — members' public profiles",
  "and their published topics. `myTopics` — present for hosts/admins: the",
  "exporting user's own topics in every status, with their comment threads.",
  "`pendingTopics` — present for admins: submitted topics awaiting review.",
  "`heartEvents` — present for admins: the append-only ledger of every ❤️",
  "(kind `heart`) and 💙 (kind `host_heart`) add/remove, oldest first;",
  "unlike per-topic `hearts` it is unaffected by the hearts cutoff, so",
  "past voting rounds can be reconstructed from it.",
].join(" ");

async function managedTopics(rows: Topic[]): Promise<ExportManagedTopic[]> {
  const trees = await listCommentTreesForTopics(
    rows.map((r) => r.id),
    { includeHostOnly: true, includeAdminOnly: true, includeHidden: false },
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    hostId: r.hostId,
    status: r.status,
    bodyMd: r.bodyMd,
    coverImageUrl: r.coverImageUrl,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt,
    comments: trees.get(r.id) ?? [],
  }));
}

export async function buildDataExport(
  timetable: { id: string; name: string; slug: string; privacy: Privacy },
  viewer: Viewer,
): Promise<DataExport> {
  const hostOnly = canSeeHostOnly(viewer);
  const moderate = canModerate(viewer);

  const feed = await buildFeed(timetable.id, viewer.userId, {});
  const heartRows = await loadPublishedHearts(timetable.id);
  const heartsByTopic = new Map<string, string[]>();
  for (const h of heartRows) {
    const list = heartsByTopic.get(h.topicId) ?? [];
    list.push(h.electorId);
    heartsByTopic.set(h.topicId, list);
  }

  const trees = await listCommentTreesForTopics(
    feed.map((t) => t.id),
    {
      includeHostOnly: hostOnly,
      includeAdminOnly: moderate,
      includeHidden: false,
    },
  );

  const topics: ExportTopic[] = feed.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    hostId: t.hostId,
    hostName: t.hostName,
    status: t.status,
    bodyMd: t.bodyMd,
    coverImageUrl: t.coverImageUrl,
    createdAt: t.createdAt,
    publishedAt: t.publishedAt,
    contentUpdatedAt: t.contentUpdatedAt,
    heartCount: t.heartCount,
    weightedScore: t.weightedScore,
    // The normalisation variants are host/admin-facing in the app; the
    // export mirrors that.
    ...(hostOnly ? { l2Score: t.l2Score, devotionScore: t.devotionScore } : {}),
    hearts: heartsByTopic.get(t.id) ?? [],
    comments: trees.get(t.id) ?? [],
  }));

  const people: ExportPerson[] = (await listPeople(timetable.id))
    .filter((p) => canSeePersonProfile(timetable.privacy, viewer, p.roles))
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      slug: p.slug,
      bio: p.bio,
      // Owner stays admin-eyes-only, same as the People page.
      roles: moderate ? p.roles : p.roles.filter((r) => r !== "owner"),
      publishedTopics: p.publishedTopics ?? [],
    }));

  const myTopics =
    viewer.userId && canProposeTopics(viewer)
      ? await managedTopics(await listHostTopics(timetable.id, viewer.userId))
      : undefined;
  const pendingTopics = moderate
    ? await managedTopics(await listSubmittedTopics(timetable.id))
    : undefined;
  // 💙 tallies are admin-eyes-only in the app, and removal history is more
  // than any non-admin surface shows — so the ledger is admin-only too.
  const heartEvents = moderate
    ? await listHeartEvents(timetable.id)
    : undefined;

  return {
    readme: README,
    forum: {
      name: timetable.name,
      slug: timetable.slug,
      exportedAt: new Date().toISOString(),
      viewerRoles: [...viewer.roles],
    },
    topics,
    people,
    ...(myTopics ? { myTopics } : {}),
    ...(pendingTopics ? { pendingTopics } : {}),
    ...(heartEvents ? { heartEvents } : {}),
  };
}
