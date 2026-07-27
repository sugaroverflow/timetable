import { ImageResponse } from "next/og";

import {
  anonGql,
  forumCardBits,
  ogCard,
  OG_SIZE,
  type OgForum,
} from "@/lib/ogCard";

export const alt = "Topic";
export const size = OG_SIZE;
export const contentType = "image/png";

const TOPIC_QUERY = `
  query OgTopic($s: String!, $topic: String!) {
    timetable(idOrSlug: $s) { name settings }
    topicPermalink(idOrSlug: $s, topicSlug: $topic) { title hostName }
  }
`;

/** Topic social card: forum name as the kicker, topic title big, host as
 * the footer. Resolved anonymously — unpublished topics and private forums
 * degrade to the forum (or generic app) card. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; topicSlug: string }>;
}) {
  const { slug, topicSlug } = await params;
  const data = await anonGql<{
    timetable: OgForum | null;
    topicPermalink: { title: string; hostName: string | null } | null;
  }>(TOPIC_QUERY, { s: slug, topic: topicSlug });

  const forum = data?.timetable;
  if (!forum) {
    return new ImageResponse(ogCard({ emoji: "📚", title: "Topic" }), OG_SIZE);
  }
  const bits = forumCardBits(forum);
  const topic = data?.topicPermalink;
  if (!topic) {
    return new ImageResponse(
      ogCard({ emoji: bits.emoji, title: forum.name, accent: bits.accent }),
      OG_SIZE,
    );
  }
  return new ImageResponse(
    ogCard({
      kicker: forum.name,
      title: topic.title,
      footer: topic.hostName,
      accent: bits.accent,
    }),
    OG_SIZE,
  );
}
