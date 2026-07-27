import { ImageResponse } from "next/og";

import {
  anonGql,
  forumCardBits,
  ogCard,
  OG_FORUM_QUERY,
  OG_SIZE,
  type OgForum,
} from "@/lib/ogCard";

export const alt = "Forum";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Forum social card: the forum's own identity, no app branding. Resolved
 * anonymously, so private forums fall back to the generic app card. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await anonGql<{ timetable: OgForum | null }>(OG_FORUM_QUERY, {
    s: slug,
  });
  const forum = data?.timetable;
  if (!forum) {
    return new ImageResponse(ogCard({ emoji: "📚", title: "Topic" }), OG_SIZE);
  }
  const bits = forumCardBits(forum);
  return new ImageResponse(
    ogCard({ emoji: bits.emoji, title: forum.name, accent: bits.accent }),
    OG_SIZE,
  );
}
