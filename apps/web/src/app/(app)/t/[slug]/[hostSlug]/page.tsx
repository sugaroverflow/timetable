import { Heart } from "lucide-react";
import { notFound } from "next/navigation";

import { isElector, isHost, type Role } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import {
  PersonProfileCard,
  type ProfileCardPerson,
} from "@/components/PersonProfileCard";
import { TopicCard } from "@/components/TopicCard";
import {
  FEED_PAGE_SIZE,
  fetchFeedPage,
  topicCardProps,
  type FeedPage,
} from "@/lib/feedPage";
import { gqlFetch } from "@/lib/graphql";

import { loadMoreFeed } from "../feed/actions";

const PERSON_QUERY = `
  query PersonPage($s: String!, $userSlug: String!) {
    person(idOrSlug: $s, userSlug: $userSlug) {
      userId name image slug roles bioHtml
    }
  }
`;

/** A topic section (their topics / their hearted topics) with its own
 * infinite scroller; the two sections page independently. */
function TopicSection({
  title,
  page,
  host,
  heartedBy,
  seed,
  empty,
}: {
  title: React.ReactNode;
  page: FeedPage;
  host: string;
  heartedBy: string;
  seed: string;
  empty: React.ReactNode;
}) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      {page.topics.length === 0 ? (
        empty
      ) : (
        <InfiniteFeed
          key={`${host}|${heartedBy}|${seed}`}
          slug={page.slug}
          sort="random"
          host={host}
          heartedBy={heartedBy}
          seed={seed}
          pageSize={FEED_PAGE_SIZE}
          initialHasNext={page.hasNext}
          loadMore={loadMoreFeed}
        >
          {page.topics.map((topic) => (
            <TopicCard key={topic.id} {...topicCardProps(page, topic)} />
          ))}
        </InfiniteFeed>
      )}
    </>
  );
}

/** Person page: /t/[slug]/[userSlug] — profile header, then their topics
 * (hosts) and the topics they heart (electors); host+elector members get
 * both, topics first. Shows the same content as /feed?host=<id> for hosts. */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ slug: string; hostSlug: string }>;
}) {
  const { slug, hostSlug } = await params;
  const { person } = await gqlFetch<{ person: ProfileCardPerson | null }>(
    PERSON_QUERY,
    { s: slug, userSlug: hostSlug },
  );
  if (!person) notFound();

  const roles = person.roles as Role[];
  const host = isHost(roles);
  const elector = isElector(roles);
  // Fresh shuffle seed per visit, stable across this render's scroll pages
  // (same pattern as the feed page).
  // eslint-disable-next-line react-hooks/purity -- server-only, once per request
  const seed = Math.random().toString(36).slice(2, 10);

  const [hostPage, heartedPage] = await Promise.all([
    host
      ? fetchFeedPage(slug, "random", person.userId, 0, false, seed)
      : Promise.resolve(null),
    elector
      ? fetchFeedPage(slug, "random", "", 0, false, seed, person.userId)
      : Promise.resolve(null),
  ]);
  const settings = (hostPage ?? heartedPage)?.settings;

  return (
    <div className="stack">
      <PersonProfileCard
        slug={slug}
        person={person}
        labels={settings?.roleLabels}
        linkPhoto={false}
      />
      {hostPage ? (
        <TopicSection
          title="Topics"
          page={hostPage}
          host={person.userId}
          heartedBy=""
          seed={seed}
          empty={<EmptyState icon="◇" title="No published topics yet" />}
        />
      ) : null}
      {heartedPage ? (
        <TopicSection
          title={
            <>
              <Heart size={14} fill="currentColor" aria-hidden /> Hearted topics
            </>
          }
          page={heartedPage}
          host=""
          heartedBy={person.userId}
          seed={seed}
          empty={<EmptyState icon="♥" title="No hearted topics yet" />}
        />
      ) : null}
    </div>
  );
}
