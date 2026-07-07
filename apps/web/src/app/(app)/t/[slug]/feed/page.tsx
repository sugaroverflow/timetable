import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import { FeedSortControl } from "@/components/FeedSortControl";
import { HostFilter } from "@/components/HostFilter";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import { MarkFeedSeen } from "@/components/MarkFeedSeen";
import { TopicCard } from "@/components/TopicCard";
import {
  FEED_PAGE_SIZE,
  fetchFeedPage,
  isTopicNew,
  normalizeFeedSort,
} from "@/lib/feedPage";
import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

import { loadMoreFeed } from "./actions";

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; host?: string; hearted?: string }>;
}) {
  const { slug } = await params;
  const {
    sort: sortParam,
    host: hostParam,
    hearted: heartedParam,
  } = await searchParams;
  const sort = normalizeFeedSort(sortParam);
  const host = hostParam ?? "";
  const hearted = heartedParam === "me";

  const page = await fetchFeedPage(slug, sort, host, 0, hearted);
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      {hearted ? (
        <div className="page-head">
          <h2 style={{ fontSize: 18, margin: 0 }}>My hearted topics</h2>
          <p>Published topics you currently heart.</p>
        </div>
      ) : null}
      <div className="toolbar">
        <label htmlFor="sort">Sort</label>
        <FeedSortControl value={sort} />
        {page.hosts.length > 0 ? (
          <HostFilter
            value={host}
            hosts={page.hosts}
            allLabel={`All ${pluralLabel(hostLabel)}`}
          />
        ) : null}
      </div>

      {!page.isMember ? (
        <div className="notice">
          You&rsquo;re viewing a public feed. <Link href="/sign-in">Sign in</Link>{" "}
          to heart and comment.
        </div>
      ) : null}

      {page.topics.length === 0 && hearted ? (
        <EmptyState
          icon="♥"
          title="No hearted topics yet"
          hint="Heart topics in the feed and they'll collect here."
        />
      ) : page.topics.length === 0 ? (
        <EmptyState
          icon="◇"
          title="No published topics yet"
          hint={`${pluralLabel(hostLabel)} draft and submit topics from My Topics; ${pluralLabel(adminLabel).toLowerCase()} publish them from Pending Topics.`}
        />
      ) : (
        <InfiniteFeed
          key={`${sort}|${host}|${hearted}`}
          slug={slug}
          sort={sort}
          host={host}
          hearted={hearted}
          pageSize={FEED_PAGE_SIZE}
          initialHasNext={page.hasNext}
          loadMore={loadMoreFeed}
        >
          {page.topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              perms={page.perms}
              slug={slug}
              viewerId={page.viewerId}
              isNew={isTopicNew(topic, page.lastSeenAt)}
              hostLabel={page.settings.roleLabels?.host}
              adminLabel={adminLabel}
              viewerHeartCount={page.viewerHeartCount}
              hosts={page.hosts}
            />
          ))}
        </InfiniteFeed>
      )}
    </div>
  );
}
