import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { isElector, isHost, type Role } from "@timetable/shared";

import { anonGql } from "@/lib/ogCard";

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

import { loadMoreFeed } from "../topics/actions";

const PERSON_QUERY = `
  query PersonPage($s: String!, $userSlug: String!) {
    person(idOrSlug: $s, userSlug: $userSlug) {
      userId name image slug roles bioHtml
    }
  }
`;

const PERSON_BY_ID_QUERY = `
  query PersonPageById($s: String!, $userId: String!) {
    person(idOrSlug: $s, userId: $userId) {
      userId name image slug roles bioHtml
    }
  }
`;

/** Social/tab metadata (QA 2026-07-27): the person's name — resolved
 * anonymously, so profiles the public can't see inherit the forum layout's
 * generic metadata instead. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; hostSlug: string }>;
}): Promise<Metadata> {
  const { slug, hostSlug } = await params;
  const data = await anonGql<{ person: { name: string | null } | null }>(
    `query OgPersonMeta($s: String!, $userSlug: String!) {
      person(idOrSlug: $s, userSlug: $userSlug) { name }
    }`,
    { s: slug, userSlug: hostSlug },
  );
  const name = data?.person?.name;
  if (!name) return {};
  return { title: name, openGraph: { title: name } };
}

/** A topic section (their topics / their hearted topics) with its own
 * infinite scroller; the two sections page independently. */
function TopicSection({
  title,
  page,
  host,
  heartedBy,
  refreshToken,
  empty,
}: {
  title: React.ReactNode;
  page: FeedPage;
  host: string;
  heartedBy: string;
  refreshToken: string;
  empty: React.ReactNode;
}) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      {page.topics.length === 0 ? (
        empty
      ) : (
        <InfiniteFeed
          key={`${host}|${heartedBy}`}
          slug={page.slug}
          sort="recent"
          host={host}
          heartedBy={heartedBy}
          seed=""
          refreshToken={refreshToken}
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

/** Resolve by member slug, falling back to userId — PersonChips link by
 * id (they don't know slugs) and land here; those get redirected to the
 * canonical slug URL. Slug lookup runs first, so a slug can never be
 * shadowed by an id. */
async function resolvePerson(
  slug: string,
  hostSlug: string,
): Promise<ProfileCardPerson | null> {
  const { person } = await gqlFetch<{ person: ProfileCardPerson | null }>(
    PERSON_QUERY,
    { s: slug, userSlug: hostSlug },
  );
  if (person) return person;
  const byId = await gqlFetch<{ person: ProfileCardPerson | null }>(
    PERSON_BY_ID_QUERY,
    { s: slug, userId: hostSlug },
  );
  if (byId.person?.slug) redirect(`/f/${slug}/${byId.person.slug}`);
  return byId.person;
}

/** Person page: /f/[slug]/[userSlug] — profile header, then their topics
 * (hosts) and the topics they heart (electors); host+elector members get
 * both, topics first. Shows the same content as /topics?host=<id> for hosts. */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ slug: string; hostSlug: string }>;
}) {
  const { slug, hostSlug } = await params;

  const person = await resolvePerson(slug, hostSlug);
  if (!person) notFound();

  const roles = person.roles as Role[];
  const host = isHost(roles);
  const elector = isElector(roles);
  // eslint-disable-next-line react-hooks/purity -- server-only render marker
  const refreshToken = Math.random().toString(36).slice(2, 10);

  // Newest first (QA 2026-07-28) — a profile reads like a record, not a
  // ballot, so no shuffle seed here.
  const [hostPage, heartedPage] = await Promise.all([
    host
      ? fetchFeedPage(slug, "recent", person.userId, 0, false)
      : Promise.resolve(null),
    elector
      ? fetchFeedPage(slug, "recent", "", 0, false, "", person.userId)
      : Promise.resolve(null),
  ]);
  const feed = hostPage ?? heartedPage;

  return (
    <div className="stack">
      <PersonProfileCard
        slug={slug}
        person={person}
        labels={feed?.settings.roleLabels}
        linkPhoto={false}
        isSelf={feed?.viewerId === person.userId}
      />
      {hostPage ? (
        <TopicSection
          title="Topics"
          page={hostPage}
          host={person.userId}
          heartedBy=""
          refreshToken={refreshToken}
          empty={<EmptyState icon="◇" title="No published topics yet" />}
        />
      ) : null}
      {heartedPage ? (
        <TopicSection
          title="Topics they ❤️"
          page={heartedPage}
          host=""
          heartedBy={person.userId}
          refreshToken={refreshToken}
          empty={<EmptyState icon="♥" title="No ❤️ topics yet" />}
        />
      ) : null}
    </div>
  );
}
