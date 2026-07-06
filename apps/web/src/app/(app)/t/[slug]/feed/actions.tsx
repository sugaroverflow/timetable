"use server";

import { TopicCard } from "@/components/TopicCard";
import { fetchFeedPage, isTopicNew } from "@/lib/feedPage";
import { roleLabel } from "@/lib/timetableSettings";

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
): Promise<{ cards: React.ReactNode; hasNext: boolean }> {
  const page = await fetchFeedPage(slug, sort, host, offset);
  return {
    cards: page.topics.map((topic) => (
      <TopicCard
        key={topic.id}
        topic={topic}
        perms={page.perms}
        slug={slug}
        viewerId={page.viewerId}
        isNew={isTopicNew(topic, page.lastSeenAt)}
        hostLabel={page.settings.roleLabels?.host}
        adminLabel={roleLabel(page.settings.roleLabels, "admin")}
        viewerHeartCount={page.viewerHeartCount}
      />
    )),
    hasNext: page.hasNext,
  };
}
