import { Heart } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/Avatar";
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
import { gqlFetch } from "@/lib/graphql";
import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

import { loadMoreFeed } from "./actions";

type HostCard = {
  userId: string;
  name: string | null;
  bioHtml: string | null;
} | null;

const HOST_CARD_QUERY = `
  query FeedHostCard($s: String!, $u: String!) {
    person(idOrSlug: $s, userId: $u) { userId name bioHtml }
  }
`;

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sort?: string;
    host?: string;
    hearted?: string;
    seed?: string;
  }>;
}) {
  const { slug } = await params;
  const {
    sort: sortParam,
    host: hostParam,
    hearted: heartedParam,
    seed: seedParam,
  } = await searchParams;
  const sort = normalizeFeedSort(sortParam);
  const host = hostParam ?? "";
  const hearted = heartedParam === "me";
  // Random is the default sort, so a first visit has no seed in the URL —
  // mint a fresh one server-side so the shuffle is genuinely random per visit
  // yet stable across this render's infinite-scroll pages.
  const seed =
    seedParam ?? (sort === "random" ? Math.random().toString(36).slice(2, 10) : "");

  const page = await fetchFeedPage(slug, sort, host, 0, hearted, seed);
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  // Filtering to one host puts their profile card above the topics (QA #59).
  let hostCard: HostCard = null;
  if (host) {
    const data = await gqlFetch<{ person: HostCard }>(HOST_CARD_QUERY, {
      s: slug,
      u: host,
    });
    hostCard = data.person;
  }

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      {hearted ? (
        <div className="page-head">
          <h2 className="section-title">
            <Heart size={14} fill="currentColor" aria-hidden /> Topics
          </h2>
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

      {hostCard ? (
        <div className="card stack host-filter-card">
          <div className="row" style={{ alignItems: "center" }}>
            <Avatar name={hostCard.name} large />
            <div>
              <strong>{hostCard.name ?? hostLabel}</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                {hostLabel} · topics below
              </div>
            </div>
          </div>
          {hostCard.bioHtml ? (
            <div
              className="topic-body"
              dangerouslySetInnerHTML={{ __html: hostCard.bioHtml }}
            />
          ) : null}
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
          key={`${sort}|${host}|${hearted}|${seed}`}
          slug={slug}
          sort={sort}
          host={host}
          hearted={hearted}
          seed={seed}
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
