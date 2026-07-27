import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { type Role } from "@timetable/shared";

import { anonGql } from "@/lib/ogCard";

import { TopicCard } from "@/components/TopicCard";
import { topicPerms } from "@/lib/feedPage";
import type { FeedTopic } from "@/lib/feedTypes";
import { TOPIC_FEED_FIELDS } from "@/lib/gqlFragments";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";
import { topicPath } from "@/lib/topicPath";

type Data = {
  timetable: {
    viewerRoles: string[];
    settings: string;
    viewerHeartedPublishedCount: number | null;
  } | null;
  me: { id: string } | null;
  timetableHosts: { id: string; name: string | null }[];
  topicPermalink: FeedTopic | null;
};

const QUERY = `
  query TopicPermalink($s: String!, $topic: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings viewerHeartedPublishedCount }
    me { id }
    timetableHosts(idOrSlug: $s) { id name }
    topicPermalink(idOrSlug: $s, topicSlug: $topic) {
      ${TOPIC_FEED_FIELDS}
    }
  }
`;

/** Social/tab metadata (QA 2026-07-27): topic title + a plain-text excerpt.
 * Resolved anonymously so shares of private forums / unpublished topics
 * carry nothing and inherit the forum layout's generic metadata. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; topicSlug: string }>;
}): Promise<Metadata> {
  const { slug, topicSlug } = await params;
  const data = await anonGql<{
    topicPermalink: { title: string; bodyHtml: string } | null;
  }>(
    `query OgTopicMeta($s: String!, $topic: String!) {
      topicPermalink(idOrSlug: $s, topicSlug: $topic) { title bodyHtml }
    }`,
    { s: slug, topic: topicSlug },
  );
  const topic = data?.topicPermalink;
  if (!topic) return {};
  const text = topic.bodyHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const description = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  return {
    title: topic.title,
    ...(description ? { description } : {}),
    openGraph: {
      title: topic.title,
      ...(description ? { description } : {}),
    },
  };
}

/** The host segment is canonical-but-cosmetic: resolution is by topic slug,
 * so old links keep working after a reassignment via redirect. */
function redirectIfStaleHost(slug: string, hostSlug: string, topic: FeedTopic) {
  const canonical = topicPath(slug, topic.hostSlug, topic.slug);
  if (canonical && topic.hostSlug && hostSlug !== topic.hostSlug) {
    permanentRedirect(canonical);
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") return null;
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

export default async function TopicPermalinkPage({
  params,
}: {
  params: Promise<{ slug: string; hostSlug: string; topicSlug: string }>;
}) {
  const { slug, hostSlug, topicSlug } = await params;
  const data = await gqlFetch<Data>(QUERY, { s: slug, topic: topicSlug });
  const topic = data.topicPermalink;
  if (!topic) notFound();

  redirectIfStaleHost(slug, hostSlug, topic);

  const roles = await displayRolesFromCookies(
    (data.timetable?.viewerRoles ?? []) as Role[],
  );
  const settings = parseTimetableSettings(data.timetable?.settings);
  const perms = topicPerms(roles, topic.status);

  return (
    <div className="stack">
      <div className="toolbar">
        <StatusBadge status={topic.status} />
      </div>
      <TopicCard
        topic={topic}
        perms={perms}
        slug={slug}
        viewerId={data.me?.id ?? null}
        hostLabel={roleLabel(settings.roleLabels, "host")}
        adminLabel={roleLabel(settings.roleLabels, "admin")}
        viewerHeartCount={data.timetable?.viewerHeartedPublishedCount ?? null}
        hosts={data.timetableHosts}
      />
    </div>
  );
}
