import type { AvailabilityState, Topic } from "@timetable/db";
import {
  canDiscussSlots,
  canManageCalendar,
  canModerate,
  canProposeTopics,
  canSeeComments,
  canSeeHostOnly,
  canSeePersonProfile,
  isCalendarEnabled,
  isMember,
  type Privacy,
  type Role,
  type TimetableSettings,
  type Viewer,
} from "@timetable/shared";

import {
  buildCalendar,
  getAudienceElectorIds,
  listSlotComments,
  type CalendarSession,
  type SlotCommentView,
  type SlotCounts,
} from "./calendar";
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
 * shared permission checks as the GraphQL resolvers.
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

/** One timeslot, role-filtered exactly like the calendar page: sessions
 * are public to any reader of the forum, discussions belong to members,
 * availability (tallies + per-elector states) to hosts/admins. */
export type ExportSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  /** Locations offered at this time (empty on location-free slots). */
  locations: string[];
  /** The slot's bookings: pencilled/confirmed topics, office hours,
   * admin custom events. */
  sessions: CalendarSession[];
  /** Signed-in members: the exporting user's own 🟢🟡🔴 for this slot. */
  viewerAvailability?: AvailabilityState | null;
  /** Hosts/admins: elector availability tallies. */
  availability?: SlotCounts;
  /** Hosts/admins: each answering elector's state. */
  availabilityByUser?: {
    userId: string;
    name: string | null;
    state: AvailabilityState;
  }[];
  /** Members: the slot's discussion, oldest first — claim comments carry
   * `topicId`/`topicTitle` and a frozen `counts` snapshot. */
  comments?: SlotCommentView[];
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
  /** Forums with the calendar on: every timeslot, past included. */
  calendar?: { slots: ExportSlot[] };
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
  "past voting rounds can be reconstructed from it. `calendar` — present",
  "when the forum's calendar is enabled: every timeslot (past included)",
  "with its sessions; members also get each slot's discussion and their",
  "own availability answer; hosts and admins additionally get the elector",
  "availability tallies and per-elector states.",
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

/** The calendar section: the same role-filtered view the calendar page
 * serves, past slots included (the export is an archive). */
async function calendarExport(
  timetableId: string,
  viewer: Viewer,
): Promise<{ slots: ExportSlot[] }> {
  const hostOnly = canSeeHostOnly(viewer);
  // The wash audience — only computed for viewers who get the tallies.
  const audience = hostOnly
    ? await getAudienceElectorIds(timetableId, { kind: "all" })
    : [];
  const slots = await buildCalendar(timetableId, audience, viewer.userId, {
    includePast: true,
  });
  // Slot discussions are members-only (canDiscussSlots); admins also see
  // hidden messages, as on the calendar page.
  const commentsBySlot = canDiscussSlots(viewer)
    ? new Map(
        await Promise.all(
          slots
            .filter((s) => s.commentCount > 0)
            .map(
              async (s) =>
                [
                  s.id,
                  await listSlotComments(s.id, {
                    includeHidden: canManageCalendar(viewer),
                  }),
                ] as const,
            ),
        ),
      )
    : null;

  return {
    slots: slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      locations: s.locations,
      sessions: s.sessions,
      ...(viewer.userId ? { viewerAvailability: s.viewerState } : {}),
      ...(hostOnly
        ? {
            availability: s.counts,
            availabilityByUser: s.perUser.map((p) => ({
              userId: p.userId,
              name: p.name,
              state: p.state,
            })),
          }
        : {}),
      ...(commentsBySlot ? { comments: commentsBySlot.get(s.id) ?? [] } : {}),
    })),
  };
}

export async function buildDataExport(
  timetable: {
    id: string;
    name: string;
    slug: string;
    privacy: Privacy;
    settings: TimetableSettings;
  },
  viewer: Viewer,
): Promise<DataExport> {
  const hostOnly = canSeeHostOnly(viewer);
  const moderate = canModerate(viewer);
  // Mirror the resolvers' privacy gates (QA #42 matrix): on hosts_only /
  // no_comments forums the public gets no comment threads, and elector
  // identity (who hearts what) belongs to members on any non-public forum.
  const seesComments = canSeeComments(timetable.privacy, viewer);
  const seesElectorIds =
    viewer.sysadmin || isMember(viewer.roles) || timetable.privacy === "public";

  const feed = await buildFeed(timetable.id, viewer.userId, {});
  const heartsByTopic = seesElectorIds
    ? await heartersByTopic(timetable.id)
    : new Map<string, string[]>();

  const trees = seesComments
    ? await listCommentTreesForTopics(
        feed.map((t) => t.id),
        {
          includeHostOnly: hostOnly,
          includeAdminOnly: moderate,
          includeHidden: false,
        },
      )
    : new Map<string, CommentNode[]>();

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
  const calendar = isCalendarEnabled(timetable.settings)
    ? await calendarExport(timetable.id, viewer)
    : undefined;

  // Role-gated keys are undefined for viewers who don't get them —
  // JSON serialisation drops them from the download entirely.
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
    myTopics,
    pendingTopics,
    heartEvents,
    calendar,
  };
}

/** Current post-cutoff hearter ids per published topic. */
async function heartersByTopic(
  timetableId: string,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const h of await loadPublishedHearts(timetableId)) {
    const list = map.get(h.topicId) ?? [];
    list.push(h.electorId);
    map.set(h.topicId, list);
  }
  return map;
}
