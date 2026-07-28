import { redirect } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { MarkFeedSeen } from "@/components/MarkFeedSeen";
import { QueueControls, QueueRestartButton } from "@/components/QueueControls";
import { TopicCard } from "@/components/TopicCard";
import { fetchQueuePage, topicCardProps } from "@/lib/feedPage";
import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

/** The Topic Queue (its own sidebar page since QA 2026-07-28): one
 * unhearted topic at a time in a per-user stable shuffle, big 🔁/❤️
 * decision buttons in the card, and an explicit end-of-round state. */
export default async function QueuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { page, queue } = await fetchQueuePage(slug);
  // Guests and non-electors have no queue — the nav doesn't link here.
  if (!queue) redirect(`/f/${slug}/topics`);

  const heartedCount = page.viewerHeartCount ?? 0;
  const publishedCount = queue.roundSize + heartedCount;
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      {publishedCount === 0 ? (
        <EmptyState
          icon="◇"
          title="No published topics yet"
          hint={`${pluralLabel(hostLabel)} create topics from My Topics; ${pluralLabel(adminLabel).toLowerCase()} publish them from Pending Topics.`}
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
