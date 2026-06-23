import Link from "next/link";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { FeedSortControl } from "@/components/FeedSortControl";
import { HostFilter } from "@/components/HostFilter";
import { TopicCard, type FeedPerms } from "@/components/TopicCard";
import type { FeedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";

type Data = {
  timetable: { viewerRoles: string[] } | null;
  topicFeed: FeedTopic[];
  timetableHosts: { id: string; name: string | null }[];
};

const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

const QUERY = `
  query Feed($s: String!, $sort: String, $host: String) {
    timetable(idOrSlug: $s) { viewerRoles }
    timetableHosts(idOrSlug: $s) { id name }
    topicFeed(idOrSlug: $s, sort: $sort, hostId: $host) {
      id timetableId hostId hostName hostImage title bodyHtml status
      heartCount weightedScore viewerHasHearted commentCount
      publishedAt createdAt
      comments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
      weightedBreakdown { electorId electorName weight }
    }
  }
`;

const SORTS = new Set(["hearts", "comments", "recent"]);

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; host?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam, host: hostParam } = await searchParams;
  const sort = sortParam && SORTS.has(sortParam) ? sortParam : "hearts";
  const host = hostParam ?? "";

  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    sort,
    host: host || null,
  });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];

  const perms: FeedPerms = {
    canHeart: isElector(roles),
    canComment: roles.length > 0,
    canHostOnly: isHost(roles) || isAdmin(roles),
    canModerate: isAdmin(roles),
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <label htmlFor="sort">Sort</label>
        <FeedSortControl value={sort} />
        {data.timetableHosts.length > 0 ? (
          <HostFilter value={host} hosts={data.timetableHosts} />
        ) : null}
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 12 }}>
          {data.topicFeed.length} topic{data.topicFeed.length === 1 ? "" : "s"}
        </span>
      </div>

      {roles.length === 0 ? (
        <div className="notice">
          You&rsquo;re viewing a public feed. <Link href="/sign-in">Sign in</Link>{" "}
          to heart and comment.
        </div>
      ) : null}

      {data.topicFeed.length === 0 ? (
        <div className="notice">
          No published topics yet. Hosts can draft and submit topics from{" "}
          <strong>My topics</strong>; admins publish them from the moderation
          queue.
        </div>
      ) : (
        data.topicFeed.map((topic) => (
          <TopicCard key={topic.id} topic={topic} perms={perms} />
        ))
      )}
    </div>
  );
}
