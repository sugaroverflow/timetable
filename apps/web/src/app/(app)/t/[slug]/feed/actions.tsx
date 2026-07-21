"use server";

import { TopicCard } from "@/components/TopicCard";
import { fetchFeedPage, topicCardProps } from "@/lib/feedPage";

/**
 * Loads the next feed page as server-rendered TopicCards for the infinite
 * scroller. Permissions are re-evaluated per call, so a stale client can
 * never fetch more than its roles allow.
 */
export async function loadMoreFeed(
  slug: string,
  sort: string,
  host: string,
  offset: number,
  hearted = false,
  seed = "",
): Promise<{ cards: React.ReactNode; hasNext: boolean }> {
  const page = await fetchFeedPage(slug, sort, host, offset, hearted, seed);
  return {
    cards: page.topics.map((topic) => (
      <TopicCard key={topic.id} {...topicCardProps(page, topic)} />
    )),
    hasNext: page.hasNext,
  };
}
