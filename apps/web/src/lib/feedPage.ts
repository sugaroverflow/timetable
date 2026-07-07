import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import type { FeedPerms } from "@/components/TopicCard";
import type { FeedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import {
  parseTimetableSettings,
  type TimetableSettings,
} from "@/lib/timetableSettings";

export const FEED_PAGE_SIZE = 20;

const SORTS = new Set(["hearts", "comments", "recent"]);

export function normalizeFeedSort(sort: string | undefined): string {
  return sort && SORTS.has(sort) ? sort : "hearts";
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

const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

const QUERY = `
  query Feed($s: String!, $sort: String, $host: String, $limit: Int, $offset: Int) {
    timetable(idOrSlug: $s) { viewerRoles settings viewerHeartedPublishedCount }
    me { id }
    myFeedLastSeenAt(idOrSlug: $s)
    timetableHosts(idOrSlug: $s) { id name }
    topicFeed(idOrSlug: $s, sort: $sort, hostId: $host, limit: $limit, offset: $offset) {
      id timetableId hostId hostName hostImage hostSlug title slug bodyMd bodyHtml coverImageUrl status
      heartCount weightedScore viewerHasHearted commentCount
      publishedAt createdAt
      comments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
      weightedBreakdown { electorId electorName weight }
    }
  }
`;

/** True when the topic was published — or picked up new comments — after
 * the viewer's last feed visit. Never-seen (null) shows no highlights. */
export function isTopicNew(topic: FeedTopic, lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  if (topic.publishedAt && Date.parse(topic.publishedAt) > seen) return true;
  const newer = (comments: FeedTopic["comments"]): boolean =>
    comments.some(
      (c) => Date.parse(c.createdAt) > seen || newer(c.replies ?? []),
    );
  return newer(topic.comments);
}

export type FeedPage = {
  topics: FeedTopic[];
  hasNext: boolean;
  perms: FeedPerms;
  settings: TimetableSettings;
  viewerHeartCount: number | null;
  viewerId: string | null;
  lastSeenAt: string | null;
  isMember: boolean;
  hosts: { id: string; name: string | null }[];
};

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
): Promise<FeedPage> {
  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    sort: normalizeFeedSort(sort),
    host: host || null,
    limit: FEED_PAGE_SIZE + 1,
    offset: Math.max(0, offset),
  });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );

  return {
    topics: data.topicFeed.slice(0, FEED_PAGE_SIZE),
    hasNext: data.topicFeed.length > FEED_PAGE_SIZE,
    perms: {
      canHeart: isElector(roles),
      canComment: roles.length > 0,
      canHostOnly: isHost(roles) || isAdmin(roles),
      canModerate: isAdmin(roles),
    },
    settings: parseTimetableSettings(data.timetable?.settings),
    viewerHeartCount: data.timetable?.viewerHeartedPublishedCount ?? null,
    viewerId: data.me?.id ?? null,
    lastSeenAt: data.myFeedLastSeenAt,
    isMember: roles.length > 0,
    hosts: data.timetableHosts,
  };
}
