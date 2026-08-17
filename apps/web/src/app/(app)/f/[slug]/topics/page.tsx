import { Heart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { topicPath } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { FeedSearch } from "@/components/FeedSearch";
import { FeedSortControl } from "@/components/FeedSortControl";
import { HostFilter } from "@/components/HostFilter";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import { MarkFeedSeen } from "@/components/MarkFeedSeen";
import { PageTopicToc } from "@/components/PageTopicToc";
import {
  PersonProfileCard,
  type ProfileCardPerson,
} from "@/components/PersonProfileCard";
import { SearchHighlight } from "@/components/SearchHighlight";
import { TopicCard } from "@/components/TopicCard";
import {
  FEED_PAGE_SIZE,
  fetchFeedPage,
  normalizeFeedSort,
  topicCardProps,
} from "@/lib/feedPage";
import { gqlFetch } from "@/lib/graphql";
import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

import { loadMoreFeed } from "./actions";

type HostCard = ProfileCardPerson | null;

/** page-topic-toc data for the ❤️/💙 pages: the viewer's WHOLE hearted
 * list (the feed below paginates at 20, so the TOC can't be read off the
 * first page), slim fields only, linking to permalinks. */
const HEARTED_TOC_QUERY = `
  query HeartedToc($s: String!, $hearted: Boolean, $hostHearted: Boolean, $sort: String, $seed: String) {
    topicFeed(idOrSlug: $s, heartedByMe: $hearted, hostHeartedByMe: $hostHearted, sort: $sort, seed: $seed, limit: 500) {
      id title slug hostSlug hostId
    }
  }
`;

type HeartedTocTopic = {
  id: string;
  title: string;
  slug: string | null;
  hostSlug: string | null;
  hostId: string;
};

/** page-topic-toc (Ed, 2026-08-17): the ❤️/💙 pages open with the whole
 * hearted list as permalinks, in the page's own sort order. */
async function loadHeartedToc(args: {
  slug: string;
  hearted: boolean;
  hostHearted: boolean;
  sort: string;
  seed: string;
  hasTopics: boolean;
}): Promise<HeartedTocTopic[]> {
  if (!(args.hearted || args.hostHearted) || !args.hasTopics) return [];
  const data = await gqlFetch<{ topicFeed: HeartedTocTopic[] }>(
    HEARTED_TOC_QUERY,
    {
      s: args.slug,
      hearted: args.hearted,
      hostHearted: args.hostHearted,
      sort: args.sort,
      seed: args.seed,
    },
  );
  return data.topicFeed;
}

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
  current: { sort?: string; host?: string; hearted?: string; q?: string },
): never {
  const params = new URLSearchParams();
  if (current.sort) params.set("sort", current.sort);
  if (current.host) params.set("host", current.host);
  if (current.hearted) params.set("hearted", current.hearted);
  if (current.q) params.set("q", current.q);
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

/** Page head for the two own-gesture views (❤️ Topics / 💙 Topics); the
 * plain All Topics view has none. */
function GesturePageHead({
  hearted,
  hostHearted,
}: {
  hearted: boolean;
  hostHearted: boolean;
}) {
  if (!hearted && !hostHearted) return null;
  return (
    <div className="page-head">
      <h2 className="page-title">
        {hostHearted ? (
          <span aria-hidden>💙</span>
        ) : (
          <Heart size={14} fill="currentColor" aria-hidden />
        )}{" "}
        Topics
      </h2>
    </div>
  );
}

function FeedEmpty({
  hearted,
  hostHearted,
  hostLabel,
  adminLabel,
  q,
}: {
  hearted: boolean;
  hostHearted: boolean;
  hostLabel: string;
  adminLabel: string;
  q: string;
}) {
  if (q) {
    return (
      <EmptyState
        icon="◇"
        title={`No topics match “${q}”`}
        hint="Search covers titles, topic text, and author names."
      />
    );
  }
  if (hostHearted) {
    return (
      <EmptyState
        icon="♥"
        title="No 💙 topics yet"
        hint="💙 topics and they'll collect here."
      />
    );
  }
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
    q?: string;
  }>;
}) {
  const { slug } = await params;
  const {
    sort: sortParam,
    host: hostParam,
    hearted: heartedParam,
    shuffle: seedParam,
    q: qParam,
  } = await searchParams;
  // The queue graduated to its own page (QA 2026-07-28); old ?sort=queue
  // links follow it there.
  if (sortParam === "queue") {
    redirect(`/f/${slug}/queue`);
  }
  const sort = normalizeFeedSort(sortParam);
  const host = hostParam ?? "";
  const hearted = heartedParam === "me";
  // "?hearted=host" is the host's 💙 Topics view (host hearts, 2026-08-04).
  const hostHearted = heartedParam === "host";
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
      q: qParam,
    });
  }
  const seed = seedParam ?? "";
  const q = (qParam ?? "").trim();

  const page = await fetchFeedPage({
    slug,
    sort,
    host,
    hearted,
    seed,
    hostHearted,
    q,
  });
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  const hostCard = await loadHostCard(slug, host);

  const tocTopics = await loadHeartedToc({
    slug,
    hearted,
    hostHearted,
    sort,
    seed,
    hasTopics: page.topics.length > 0,
  });

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      <GesturePageHead hearted={hearted} hostHearted={hostHearted} />
      <PageTopicToc
        items={tocTopics.map((t) => ({
          id: t.id,
          title: t.title,
          href: topicPath(slug, t.hostSlug, t.slug, t.hostId),
        }))}
      />
      <div className="toolbar feed-toolbar">
        <FeedSearch value={q} />
        {page.hosts.length > 0 ? (
          <HostFilter
            value={host}
            hosts={page.hosts}
            allLabel={`All ${pluralLabel(hostLabel)}`}
          />
        ) : null}
        <FeedSortControl value={sort} />
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
          isSelf={page.viewerId === hostCard.userId}
        />
      ) : null}

      {page.topics.length === 0 ? (
        <FeedEmpty
          hearted={hearted}
          hostHearted={hostHearted}
          hostLabel={hostLabel}
          adminLabel={adminLabel}
          q={q}
        />
      ) : (
        <SearchHighlight q={q}>
          <InfiniteFeed
            key={`${sort}|${host}|${hearted}|${hostHearted}|${seed}|${q}`}
            query={{ slug, sort, host, hearted, hostHearted, q, seed }}
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
        </SearchHighlight>
      )}
    </div>
  );
}
