import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { MarkFeedSeen } from "@/components/MarkFeedSeen";
import { QueueControls, QueueRestartButton } from "@/components/QueueControls";
import { TopicCard } from "@/components/TopicCard";
import { fetchQueuePage, topicCardProps } from "@/lib/feedPage";
import { isElector, isHost, type Role } from "@timetable/shared";

import { pluralLabel, roleLabel } from "@/lib/timetableSettings";

/** End-of-round copy per gesture: elector ❤️ tally, host 💙 pointer, or
 * the plain read-through count. */
function endOfRoundHint(args: {
  viewerCanHeart: boolean;
  viewerCanHostHeart: boolean;
  roundSize: number;
  heartedCount: number;
}): string {
  if (args.viewerCanHeart) {
    return `You've seen all ${args.roundSize} and currently ❤️ ${args.heartedCount}.`;
  }
  if (args.viewerCanHostHeart) {
    return `You've seen all ${args.roundSize} — your 💙s are on your 💙 Topics page.`;
  }
  return `You've seen all ${args.roundSize}.`;
}

/** Where you are under the card. The round counter would be a lie beneath
 * an older topic — it counts where the QUEUE is, not what you're reading,
 * and going back never moves it (Ed, 2026-08-21) — so while looking back
 * it says how far back instead. */
function QueueProgress({
  back,
  position,
  roundSize,
}: {
  back: number;
  position: number;
  roundSize: number;
}) {
  return (
    <p className="faint queue-progress">
      {back > 0
        ? `Looking back · ${back} topic${back === 1 ? "" : "s"} ago`
        : `${position} of ${roundSize} this round`}
    </p>
  );
}

/** The explicit "you've seen everything" screen. queue-back rides it too
 * (Ed, 2026-08-21): the end of a round is exactly where "wait, go back"
 * happens, so the last topic is one step away from here. */
function QueueDone({
  slug,
  roundSize,
  historyCount,
  hint,
}: {
  slug: string;
  roundSize: number;
  historyCount: number;
  hint: string;
}) {
  return (
    <div className="stack queue-done">
      <EmptyState icon="✓" title="That's every topic" hint={hint} />
      <QueueRestartButton slug={slug} roundSize={roundSize} />
      {historyCount > 0 ? (
        <Link className="btn btn-ghost" href={`/f/${slug}/queue?back=1`}>
          <ArrowLeft size={16} aria-hidden /> Look back at the last topic
        </Link>
      ) : null}
    </div>
  );
}

/** The Topic Queue (its own sidebar page since QA 2026-07-28; v2
 * 2026-07-29): one published topic at a time in a per-user stable
 * shuffle. Electors get a big ❤️ switcher + Next; host-non-electors get
 * the same switch bound to 💙 (host hearts, 2026-08-04); other members
 * (hosts asked for the queue too) read through with Next alone. Explicit
 * end-of-round state; the forum's ❤️-count-from cutoff resets everyone's
 * review for a fresh-eyes pass. */
export default async function QueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** queue-back: `?back=n` shows the topic n steps behind the live one
   * (Ed, 2026-08-21). Read-only — it reviews nothing, so the round
   * counter and `remaining` are untouched. */
  searchParams: Promise<{ back?: string }>;
}) {
  const { slug } = await params;
  const { back: backParam } = await searchParams;
  const back = Math.max(0, Math.trunc(Number(backParam)) || 0);
  const { page, queue } = await fetchQueuePage(slug, back);
  // Guests and non-members have no queue — the nav doesn't link here.
  if (!queue) redirect(`/f/${slug}/topics`);

  const heartedCount = page.viewerHeartCount ?? 0;
  const viewerCanHeart = isElector(page.roles as Role[]);
  // Host-non-electors get the same switch bound to 💙 (host hearts,
  // 2026-08-04) — one person, one gesture.
  const viewerCanHostHeart = !viewerCanHeart && isHost(page.roles as Role[]);
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
            // NOTE: this key does NOT remount the client components inside
            // across router.refresh() (server-component keys reconcile in
            // place — reproduced on dev, 2026-07-29). QueueControls resets
            // its own per-topic state instead; the key stays for ordinary
            // navigations.
            key={queue.current.id}
            {...topicCardProps(page, queue.current)}
            expandBody
            queueControls={
              <QueueControls
                topicId={queue.current.id}
                hearted={
                  viewerCanHostHeart
                    ? queue.current.viewerHasHostHearted
                    : queue.current.viewerHasHearted
                }
                canHeart={viewerCanHeart || viewerCanHostHeart}
                hostMode={viewerCanHostHeart}
                slug={slug}
                back={back}
                historyCount={queue.historyCount}
              />
            }
          />
          <QueueProgress
            back={back}
            position={queue.roundSize - queue.remaining + 1}
            roundSize={queue.roundSize}
          />
        </>
      ) : (
        <QueueDone
          slug={slug}
          roundSize={queue.roundSize}
          historyCount={queue.historyCount}
          hint={endOfRoundHint({
            viewerCanHeart,
            viewerCanHostHeart,
            roundSize: queue.roundSize,
            heartedCount,
          })}
        />
      )}
    </div>
  );
}
