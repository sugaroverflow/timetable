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
import { roleLabel } from "@/lib/timetableSettings";

import { loadMoreFeed } from "./actions";

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; host?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam, host: hostParam } = await searchParams;
  const sort = normalizeFeedSort(sortParam);
  const host = hostParam ?? "";

  const page = await fetchFeedPage(slug, sort, host, 0);
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      <div className="toolbar">
        <label htmlFor="sort">Sort</label>
        <FeedSortControl value={sort} />
        {page.hosts.length > 0 ? (
          <HostFilter value={host} hosts={page.hosts} />
        ) : null}
      </div>

      {!page.isMember ? (
        <div className="notice">
          You&rsquo;re viewing a public feed. <Link href="/sign-in">Sign in</Link>{" "}
          to heart and comment.
        </div>
      ) : null}

      {page.topics.length === 0 ? (
        <EmptyState
          icon="◇"
          title="No published topics yet"
          hint={`${hostLabel}s draft and submit topics from My Topics; ${adminLabel.toLowerCase()}s publish them from Pending Topics.`}
        />
      ) : (
        <InfiniteFeed
          key={`${sort}|${host}`}
          slug={slug}
          sort={sort}
          host={host}
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
            />
          ))}
        </InfiniteFeed>
      )}
    </div>
  );
}
