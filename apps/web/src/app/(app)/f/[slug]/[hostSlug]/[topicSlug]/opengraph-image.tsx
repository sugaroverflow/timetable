import { ImageResponse } from "next/og";

import {
  anonGql,
  fetchImageData,
  forumCardBits,
  ogCard,
  ogCoverCard,
  OG_SIZE,
  type OgForum,
} from "@/lib/ogCard";

export const alt = "Topic";
export const size = OG_SIZE;
export const contentType = "image/png";

const TOPIC_QUERY = `
  query OgTopic($s: String!, $topic: String!) {
    timetable: forum(idOrSlug: $s) { name settings }
    topicPermalink(idOrSlug: $s, topicSlug: $topic) { title hostName coverImageUrl }
  }
`;

/** Topic social card: with a cover photo, the full-bleed variant (cover-
 * cropped image + scrim); otherwise forum name as the kicker, topic title
 * big, host as the footer. Resolved anonymously — unpublished topics and
 * private forums degrade to the forum (or generic app) card. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; topicSlug: string }>;
}) {
  const { slug, topicSlug } = await params;
  const data = await anonGql<{
    timetable: OgForum | null;
    topicPermalink: {
      title: string;
      hostName: string | null;
      coverImageUrl: string | null;
    } | null;
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
  const cover = await fetchImageData(topic.coverImageUrl);
  if (cover) {
    return new ImageResponse(
      ogCoverCard({
        image: cover,
        kicker: forum.name,
        title: topic.title,
        footer: topic.hostName,
        accent: bits.accent,
      }),
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
