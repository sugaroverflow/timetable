import { isAdmin, type Role } from "@timetable/shared";

import { EmptyState } from "@/components/EmptyState";
import { ListSortControl } from "@/components/ListSortControl";
import { ModerationCard } from "@/components/ModerationCard";
import { ReadyFilter } from "@/components/ReadyFilter";
import type { ManagedTopic } from "@/lib/feedTypes";
import { commentTree, MANAGED_TOPIC_FIELDS } from "@/lib/gqlFragments";
import { gqlFetch } from "@/lib/graphql";
import {
  normalizeManagedSort,
  PENDING_SORTS,
  sortManagedTopics,
} from "@/lib/managedTopicSort";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

type Data = {
  timetable: { viewerRoles: string[]; settings: string } | null;
  timetableHosts: { id: string; name: string | null }[];
  me: { id: string } | null;
  moderationQueue: ManagedTopic[];
};

const QUERY = `
  query Moderation($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerRoles settings }
    timetableHosts: forumHosts(idOrSlug: $s) { id name }
    me { id }
    moderationQueue(idOrSlug: $s) {
      ${MANAGED_TOPIC_FIELDS}
      ${commentTree("adminComments")}
    }
  }
`;

/** ?show= filter: default is the ready-to-publish view — the queue's
 * actionable slice; still-drafting topics stay one selection away
 * (2026-08-06). */
type ShowFilter = "ready" | "drafting" | "all";

function normalizeShow(value: string | undefined): ShowFilter {
  return value === "drafting" || value === "all" ? value : "ready";
}

function splitQueue(queue: ManagedTopic[], show: ShowFilter) {
  const readyCount = queue.filter((t) => t.readyAt).length;
  const visible =
    show === "all"
      ? queue
      : queue.filter((t) => (show === "ready" ? t.readyAt : !t.readyAt));
  return { readyCount, draftingCount: queue.length - readyCount, visible };
}

/** The current filter matched nothing (but the queue isn't empty) — say
 * what the other view holds so the counts stay honest. */
function FilteredEmptyState({
  show,
  readyCount,
  draftingCount,
}: {
  show: ShowFilter;
  readyCount: number;
  draftingCount: number;
}) {
  if (show === "ready") {
    return (
      <EmptyState
        icon="✓"
        title="Nothing marked ready"
        hint={`${draftingCount} ${draftingCount === 1 ? "topic is" : "topics are"} still drafting — switch the filter to see them.`}
      />
    );
  }
  return (
    <EmptyState
      icon="✓"
      title="Nothing still drafting"
      hint={`All ${readyCount} pending ${readyCount === 1 ? "topic is" : "topics are"} marked ready to publish.`}
    />
  );
}

export default async function ModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; show?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam, show: showParam } = await searchParams;
  const sort = normalizeManagedSort(sortParam, PENDING_SORTS);
  const show = normalizeShow(showParam);
  const data = await gqlFetch<Data>(QUERY, { s: slug });
  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const adminLabel = roleLabel(settings.roleLabels, "admin");
  const hostLabel = roleLabel(settings.roleLabels, "host");

  if (!isAdmin(roles)) {
    return <div className="notice">{adminLabel}s only.</div>;
  }

  const queue = data.moderationQueue;
  const { readyCount, draftingCount, visible } = splitQueue(queue, show);

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">Pending topics</h2>
      </div>
      {queue.length > 0 ? (
        <div className="toolbar feed-toolbar">
          <ReadyFilter
            value={show === "ready" ? "" : show}
            readyCount={readyCount}
            draftingCount={draftingCount}
          />
          {visible.length > 1 ? (
            <ListSortControl value={sort} options={PENDING_SORTS} />
          ) : null}
        </div>
      ) : null}
      {queue.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Queue is clear"
          hint="Nothing is waiting to be published right now."
        />
      ) : visible.length === 0 ? (
        <FilteredEmptyState
          show={show}
          readyCount={readyCount}
          draftingCount={draftingCount}
        />
      ) : (
        <ul className="list">
          {sortManagedTopics(visible, sort).map((topic) => (
            <ModerationCard
              key={topic.id}
              topic={topic}
              slug={slug}
              viewerId={data.me?.id ?? null}
              hostLabel={hostLabel}
              adminLabel={adminLabel}
              electorLabel={roleLabel(settings.roleLabels, "elector")}
              hosts={data.timetableHosts}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
