import {
  isAdmin,
  isElector,
  isHost,
  isHostCommentsEnabled,
  type Role,
} from "@timetable/shared";

import type { FeedPerms } from "@/components/TopicCard";
import type { FeedTopic } from "@/lib/feedTypes";
import { TOPIC_FEED_FIELDS } from "@/lib/gqlFragments";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  roleLabel,
  type TimetableSettings,
} from "@/lib/timetableSettings";

export const FEED_PAGE_SIZE = 20;

const SORTS = new Set([
  "raw",
  "l2",
  "l1",
  "devotion",
  "comments",
  "created",
  "recent",
  "random",
]);

/** Default feed sort is Random (product feedback round 1). "hearts" is a
 * legacy alias for the L1 weighted score. */
export function normalizeFeedSort(sort: string | undefined): string {
  if (!sort) return "random";
  if (sort === "hearts") return "l1";
  return SORTS.has(sort) ? sort : "random";
}

type Data = {
  timetable: {
    viewerRoles: string[];
    settings: string;
    viewerHeartedPublishedCount: number | null;
  } | null;
  me: { id: string } | null;
  myFeedLastSeenAt: string | null;
  topicFeed: FeedTopic[];
  timetableHosts: { id: string; name: string | null }[];
};

const QUERY = `
  query Feed($s: String!, $sort: String, $seed: String, $host: String, $hearted: Boolean, $hostHearted: Boolean, $heartedBy: String, $q: String, $limit: Int, $offset: Int) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings viewerHeartedPublishedCount }
    me { id }
    myFeedLastSeenAt(idOrSlug: $s)
    timetableHosts: forumHosts(idOrSlug: $s) { id name }
    topicFeed(idOrSlug: $s, sort: $sort, seed: $seed, hostId: $host, heartedByMe: $hearted, hostHeartedByMe: $hostHearted, heartedBy: $heartedBy, q: $q, limit: $limit, offset: $offset) {
      ${TOPIC_FEED_FIELDS}
      contentUpdatedAt
    }
  }
`;

/** True when the topic was published, edited, or picked up new comments
 * after the viewer's last feed visit. Never-seen (null) shows no
 * highlights. */
function isTopicNew(topic: FeedTopic, lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  if (topic.publishedAt && Date.parse(topic.publishedAt) > seen) return true;
  if (topic.contentUpdatedAt && Date.parse(topic.contentUpdatedAt) > seen) {
    return true;
  }
  const newer = (comments: FeedTopic["comments"]): boolean =>
    comments.some(
      (c) => Date.parse(c.createdAt) > seen || newer(c.replies ?? []),
    );
  return newer(topic.comments);
}

/**
 * The one place viewer permissions for a topic are derived — used by the
 * feed (whose topics are always published; see buildFeed in core) and by
 * the topic permalink, which can render unpublished topics to their host
 * and admins, where hearting/commenting must stay off.
 */
export function topicPerms(
  roles: Role[],
  status: FeedTopic["status"],
): FeedPerms {
  const published = status === "published";
  return {
    canHeart: isElector(roles) && published,
    // 💙s are the host-non-elector gesture — a dual-role member's ❤️ IS
    // their gesture (host hearts, 2026-08-04).
    canHostHeart: isHost(roles) && !isElector(roles) && published,
    canComment: roles.length > 0 && published,
    canHostOnly: isHost(roles) || isAdmin(roles),
    canModerate: isAdmin(roles),
  };
}

export type FeedPage = {
  slug: string;
  topics: FeedTopic[];
  hasNext: boolean;
  roles: Role[];
  settings: TimetableSettings;
  viewerHeartCount: number | null;
  viewerId: string | null;
  lastSeenAt: string | null;
  isMember: boolean;
  hosts: { id: string; name: string | null }[];
};

/** Everything one TopicCard needs, derived once per topic: perms gated on
 * the topic's own status, role labels resolved symmetrically. Spread into
 * <TopicCard {...topicCardProps(page, topic)} />. */
export function topicCardProps(page: FeedPage, topic: FeedTopic) {
  return {
    topic,
    perms: topicPerms(page.roles, topic.status),
    slug: page.slug,
    viewerId: page.viewerId,
    isNew: isTopicNew(topic, page.lastSeenAt),
    hostLabel: roleLabel(page.settings.roleLabels, "host"),
    adminLabel: roleLabel(page.settings.roleLabels, "admin"),
    electorLabel: roleLabel(page.settings.roleLabels, "elector"),
    viewerHeartCount: page.viewerHeartCount,
    hosts: page.hosts,
    hostCommentsEnabled: isHostCommentsEnabled(page.settings),
    lastSeenAt: page.lastSeenAt,
  };
}

export type QueueState = {
  remaining: number;
  remainingNew: number;
  roundSize: number;
  current: FeedTopic | null;
};

const QUEUE_QUERY = `
  query QueuePage($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings viewerHeartedPublishedCount }
    me { id }
    myFeedLastSeenAt(idOrSlug: $s)
    timetableHosts: forumHosts(idOrSlug: $s) { id name }
    topicQueue(idOrSlug: $s) {
      remaining remainingNew roundSize
      current {
        ${TOPIC_FEED_FIELDS}
        contentUpdatedAt
      }
    }
  }
`;

/** The Topic Queue view (?sort=queue): the current topic plus counts.
 * `queue` is null for guests and non-electors — the caller falls back to
 * the regular feed. */
export async function fetchQueuePage(
  slug: string,
): Promise<{ page: FeedPage; queue: QueueState | null }> {
  const data = await gqlFetch<
    Omit<Data, "topicFeed"> & { topicQueue: QueueState | null }
  >(QUEUE_QUERY, { s: slug });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const page = toFeedPage(slug, { ...data, topicFeed: [] }, roles);
  return { page, queue: data.topicQueue };
}

/**
 * One page of the topic feed plus the viewer-dependent bits needed to render
 * TopicCards. Used by the feed page (first page) and the load-more server
 * action (subsequent pages) so both stay in lockstep.
 */
export async function fetchFeedPage(
  slug: string,
  sort: string,
  host: string,
  offset: number,
  hearted = false,
  seed = "",
  heartedBy = "",
  hostHearted = false,
  q = "",
): Promise<FeedPage> {
  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    sort: normalizeFeedSort(sort),
    seed: seed || null,
    host: host || null,
    hearted,
    hostHearted,
    heartedBy: heartedBy || null,
    q: q.trim() || null,
    limit: FEED_PAGE_SIZE + 1,
    offset: Math.max(0, offset),
  });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  return toFeedPage(slug, data, roles);
}

function toFeedPage(slug: string, data: Data, roles: Role[]): FeedPage {
  return {
    slug,
    topics: data.topicFeed.slice(0, FEED_PAGE_SIZE),
    hasNext: data.topicFeed.length > FEED_PAGE_SIZE,
    roles,
    settings: parseTimetableSettings(data.timetable?.settings),
    viewerHeartCount: data.timetable?.viewerHeartedPublishedCount ?? null,
    viewerId: data.me?.id ?? null,
    lastSeenAt: data.myFeedLastSeenAt,
    isMember: roles.length > 0,
    hosts: data.timetableHosts,
  };
}
