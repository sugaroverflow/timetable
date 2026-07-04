import Link from "next/link";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { FeedSortControl } from "@/components/FeedSortControl";
import { HostFilter } from "@/components/HostFilter";
import { TopicCard, type FeedPerms } from "@/components/TopicCard";
import type { FeedTopic } from "@/lib/feedTypes";
import { gqlFetch } from "@/lib/graphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

type Data = {
  timetable: {
    viewerRoles: string[];
    settings: string;
    viewerHeartedPublishedCount: number | null;
  } | null;
  topicFeed: FeedTopic[];
  timetableHosts: { id: string; name: string | null }[];
};

const COMMENT_FIELDS = `
  id parentId authorId authorName authorImage body visibility hidden createdAt
`;

const QUERY = `
  query Feed($s: String!, $sort: String, $host: String, $limit: Int, $offset: Int) {
    timetable(idOrSlug: $s) { viewerRoles settings viewerHeartedPublishedCount }
    timetableHosts(idOrSlug: $s) { id name }
    topicFeed(idOrSlug: $s, sort: $sort, hostId: $host, limit: $limit, offset: $offset) {
      id timetableId hostId hostName hostImage title bodyHtml coverImageUrl status
      heartCount weightedScore viewerHasHearted commentCount
      publishedAt createdAt
      comments { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} replies { ${COMMENT_FIELDS} } } }
      weightedBreakdown { electorId electorName weight }
    }
  }
`;

const SORTS = new Set(["hearts", "comments", "recent"]);
const PAGE_SIZE = 20;

function pageHref({
  sort,
  host,
  page,
}: {
  sort: string;
  host: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (sort !== "hearts") params.set("sort", sort);
  if (host) params.set("host", host);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; host?: string; page?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam, host: hostParam, page: pageParam } = await searchParams;
  const sort = sortParam && SORTS.has(sortParam) ? sortParam : "hearts";
  const host = hostParam ?? "";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const data = await gqlFetch<Data>(QUERY, {
    s: slug,
    sort,
    host: host || null,
    limit: PAGE_SIZE + 1,
    offset,
  });
  const roles = (data.timetable?.viewerRoles ?? []) as Role[];
  const settings = parseTimetableSettings(data.timetable?.settings);
  const topics = data.topicFeed.slice(0, PAGE_SIZE);
  const hasNext = data.topicFeed.length > PAGE_SIZE;

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
          Page {page}
        </span>
      </div>

      {roles.length === 0 ? (
        <div className="notice">
          You&rsquo;re viewing a public feed. <Link href="/sign-in">Sign in</Link>{" "}
          to heart and comment.
        </div>
      ) : null}

      {topics.length === 0 ? (
        <EmptyState
          icon="◇"
          title="No published topics yet"
          hint="Hosts draft and submit topics from My topics; admins publish them from the moderation queue."
        />
      ) : (
        topics.map((topic) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            perms={perms}
            hostLabel={settings.roleLabels?.host}
            viewerHeartCount={data.timetable?.viewerHeartedPublishedCount ?? null}
          />
        ))
      )}

      {(page > 1 || hasNext) && (
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          {page > 1 ? (
            <Link href={pageHref({ sort, host, page: page - 1 })} className="btn">
              Previous
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link
              href={pageHref({ sort, host, page: page + 1 })}
              className="btn btn-primary"
            >
              Next
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
