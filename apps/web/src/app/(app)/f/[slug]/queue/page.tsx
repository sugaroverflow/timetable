import { redirect } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { MarkFeedSeen } from "@/components/MarkFeedSeen";
import { QueueControls, QueueRestartButton } from "@/components/QueueControls";
import { TopicCard } from "@/components/TopicCard";
import { fetchQueuePage, topicCardProps } from "@/lib/feedPage";
import { isElector, type Role } from "@timetable/shared";

import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

/** The Topic Queue (its own sidebar page since QA 2026-07-28; v2
 * 2026-07-29): one published topic at a time in a per-user stable
 * shuffle. Electors get a big ❤️ switcher + Next; other members (hosts
 * asked for the queue too) read through with Next alone. Explicit
 * end-of-round state; the forum's ❤️-count-from cutoff resets everyone's
 * review for a fresh-eyes pass. */
export default async function QueuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { page, queue } = await fetchQueuePage(slug);
  // Guests and non-members have no queue — the nav doesn't link here.
  if (!queue) redirect(`/f/${slug}/topics`);

  const heartedCount = page.viewerHeartCount ?? 0;
  const viewerCanHeart = isElector(page.roles as Role[]);
  const hostLabel = roleLabel(page.settings.roleLabels, "host");
  const adminLabel = roleLabel(page.settings.roleLabels, "admin");

  return (
    <div className="stack">
      {page.isMember ? <MarkFeedSeen slug={slug} /> : null}
      <div className="page-head">
        <h2 className="page-title">Topic Queue</h2>
      </div>
      {queue.roundSize === 0 ? (
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
            queueControls={
              <QueueControls
                topicId={queue.current.id}
                hearted={queue.current.viewerHasHearted}
                canHeart={viewerCanHeart}
              />
            }
          />
          <p className="faint queue-progress">
            {queue.roundSize - queue.remaining + 1} of {queue.roundSize} this
            round
          </p>
        </>
      ) : (
        <div className="stack queue-done">
          <EmptyState
            icon="✓"
            title="That's every topic"
            hint={
              viewerCanHeart
                ? `You've seen all ${queue.roundSize} and currently ❤️ ${heartedCount}.`
                : `You've seen all ${queue.roundSize}.`
            }
          />
          <QueueRestartButton slug={slug} roundSize={queue.roundSize} />
        </div>
      )}
    </div>
  );
}
