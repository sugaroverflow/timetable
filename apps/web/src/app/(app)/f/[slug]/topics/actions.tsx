"use server";

import { TopicCard } from "@/components/TopicCard";
import { fetchFeedPage, topicCardProps, type FeedQuery } from "@/lib/feedPage";

/**
 * Loads the next feed page as server-rendered TopicCards for the infinite
 * scroller. Permissions are re-evaluated per call, so a stale client can
 * never fetch more than its roles allow.
 */
export async function loadMoreFeed(
  query: FeedQuery,
): Promise<{ cards: React.ReactNode; hasNext: boolean }> {
  const page = await fetchFeedPage(query);
  return {
    cards: page.topics.map((topic) => (
      <TopicCard key={topic.id} {...topicCardProps(page, topic)} />
    )),
    hasNext: page.hasNext,
  };
}
