import { Heart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { FeedSortControl } from "@/components/FeedSortControl";
import { HostFilter } from "@/components/HostFilter";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import { MarkFeedSeen } from "@/components/MarkFeedSeen";
import {
  PersonProfileCard,
  type ProfileCardPerson,
} from "@/components/PersonProfileCard";
import { QueueControls, QueueRestartButton } from "@/components/QueueControls";
import { TopicCard } from "@/components/TopicCard";
import {
  FEED_PAGE_SIZE,
  fetchFeedPage,
  fetchQueuePage,
  normalizeFeedSort,
  topicCardProps,
} from "@/lib/feedPage";
import { gqlFetch } from "@/lib/graphql";
import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

import { loadMoreFeed } from "./actions";

type HostCard = ProfileCardPerson | null;

const HOST_CARD_QUERY = `
  query FeedHostCard($s: String!, $u: String!) {
    person(idOrSlug: $s, userId: $u) { userId name image slug roles bioHtml }
  }
`;

/** Mint a fresh shuffle seed and put it in the URL (the user-facing param
 * is named "shuffle" — QA 2026-07-27), preserving the other feed params.
 * Never returns (redirect throws). */
function redirectWithFreshSeed(
  slug: string,
  current: { sort?: string; host?: string; hearted?: string },
): never {
  const params = new URLSearchParams();
  if (current.sort) params.set("sort", current.sort);
  if (current.host) params.set("host", current.host);
  if (current.hearted) params.set("hearted", current.hearted);
  params.set("shuffle", Math.random().toString(36).slice(2, 10));
  redirect(`/f/${slug}/topics?${params.toString()}`);
}

async function loadHostCard(slug: string, host: string): Promise<HostCard> {
  if (!host) return null;
  const data = await gqlFetch<{ person: HostCard }>(HOST_CARD_QUERY, {
    s: slug,
    u: host,
  });
  return data.person;
}

function FeedEmpty({
  hearted,
  hostLabel,
  adminLabel,
}: {
  hearted: boolean;
  hostLabel: string;
  adminLabel: string;
}) {
  if (hearted) {
    return (
      <EmptyState
        icon="♥"
        title="No ❤️ topics yet"
        hint="❤️ topics and they'll collect here."
      />
    );
  }
  return (
    <EmptyState
      icon="◇"
      title="No published topics yet"
      hint={`${pluralLabel(hostLabel)} create topics from My Topics; ${pluralLabel(adminLabel).toLowerCase()} publish them from Pending Topics.`}
    />
  );
}

/** ?sort=queue — the Topic Queue: one unhearted topic at a time in a
 * per-user stable shuffle, ❤️ or Later under it, and an explicit
 * end-of-round state (product feedback 2026-07-28). */
async function QueueView({ slug }: { slug: string }) {
  const { page, queue } = await fetchQueuePage(slug);
  // Guests and non-electors have no queue — show the regular list.
  if (!queue) redirect(`/f/${slug}/topics`);

  const heartedCount = page.viewerHeartCount ?? 0;
  const publishedCount = queue.roundSize + heartedCount;
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      <div className="toolbar feed-toolbar">
        <FeedSortControl value="queue" queue={queue} />
      </div>
      {publishedCount === 0 ? (
        <FeedEmpty
          hearted={false}
          hostLabel={hostLabel}
          adminLabel={adminLabel}
        />
      ) : queue.current ? (
        <>
          <TopicCard
            {...topicCardProps(page, queue.current)}
            expandBody
            queueControls={<QueueControls topicId={queue.current.id} />}
          />
          <p className="faint queue-progress">
            {queue.roundSize - queue.remaining + 1} of {queue.roundSize} this
            round
          </p>
        </>
      ) : queue.roundSize === 0 ? (
        <EmptyState
          icon="♥"
          title="You've ❤️'d every topic"
          hint="Nothing left to queue — newly published topics will appear here."
        />
      ) : (
        <div className="stack queue-done">
          <EmptyState
            icon="✓"
            title="That's every topic"
            hint={`You've seen all ${publishedCount} and currently ❤️ ${heartedCount}.`}
          />
          <QueueRestartButton slug={slug} roundSize={queue.roundSize} />
        </div>
      )}
    </div>
  );
}

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sort?: string;
    host?: string;
    hearted?: string;
    shuffle?: string;
  }>;
}) {
  const { slug } = await params;
  const {
    sort: sortParam,
    host: hostParam,
    hearted: heartedParam,
    shuffle: seedParam,
  } = await searchParams;
  // Queue mode is a different view, not a feed sort — branch before the
  // sort normalisation (which would fold "queue" into random).
  if (sortParam === "queue") {
    return <QueueView slug={slug} />;
  }
  const sort = normalizeFeedSort(sortParam);
  const host = hostParam ?? "";
  const hearted = heartedParam === "me";
  // Random is the default sort, so a first visit has no seed in the URL.
  // Mint one and redirect so the seed is IN the URL: router.refresh()
  // after an action (edit save, heart, comment) then re-renders the same
  // order instead of reshuffling under the user (admin QA 2026-07-27).
  // Each fresh All Topics navigation still gets a new shuffle — this mints
  // a new seed per visit.
  if (sort === "random" && !seedParam) {
    redirectWithFreshSeed(slug, {
      sort: sortParam,
      host: hostParam,
      hearted: heartedParam,
    });
  }
  const seed = seedParam ?? "";

  const page = await fetchFeedPage(slug, sort, host, 0, hearted, seed);
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  const hostCard = await loadHostCard(slug, host);

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      {hearted ? (
        <div className="page-head">
          <h2 className="section-title">
            <Heart size={14} fill="currentColor" aria-hidden /> Topics
          </h2>
          <p>Published topics you currently ❤️.</p>
        </div>
      ) : null}
      <div className="toolbar feed-toolbar">
        {page.hosts.length > 0 ? (
          <HostFilter
            value={host}
            hosts={page.hosts}
            allLabel={`All ${pluralLabel(hostLabel)}`}
          />
        ) : null}
        <FeedSortControl value={sort} queue={page.queue} />
      </div>

      {!page.isMember ? (
        <div className="notice">
          You&rsquo;re viewing this forum as a guest.{" "}
          <Link href="/sign-in">Sign in</Link> to ❤️ and comment.
        </div>
      ) : null}

      {hostCard ? (
        <PersonProfileCard
          slug={slug}
          person={hostCard}
          labels={page.settings.roleLabels}
        />
      ) : null}

      {page.topics.length === 0 ? (
        <FeedEmpty
          hearted={hearted}
          hostLabel={hostLabel}
          adminLabel={adminLabel}
        />
      ) : (
        <InfiniteFeed
          key={`${sort}|${host}|${hearted}|${seed}`}
          slug={slug}
          sort={sort}
          host={host}
          hearted={hearted}
          seed={seed}
          // eslint-disable-next-line react-hooks/purity -- server-only render marker
          refreshToken={Math.random().toString(36).slice(2, 10)}
          pageSize={FEED_PAGE_SIZE}
          initialHasNext={page.hasNext}
          loadMore={loadMoreFeed}
        >
          {page.topics.map((topic) => (
            <TopicCard key={topic.id} {...topicCardProps(page, topic)} />
          ))}
        </InfiniteFeed>
      )}
    </div>
  );
}
