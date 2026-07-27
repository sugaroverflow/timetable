import { ImageResponse } from "next/og";

import {
  anonGql,
  forumCardBits,
  ogCard,
  OG_FORUM_QUERY,
  OG_SIZE,
  type OgForum,
} from "@/lib/ogCard";

export const alt = "Person";
export const size = OG_SIZE;
export const contentType = "image/png";

const PERSON_QUERY = `
  query OgPerson($s: String!, $userSlug: String!) {
    timetable(idOrSlug: $s) { name settings }
    person(idOrSlug: $s, userSlug: $userSlug) { name }
  }
`;

/** Person social card: forum name as the kicker, person's name as the
 * title. Resolved anonymously, so the person shows only where the privacy
 * matrix lets the public see their profile; otherwise the card degrades to
 * the forum's (or the generic app) card. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; hostSlug: string }>;
}) {
  const { slug, hostSlug } = await params;
  const data = await anonGql<{
    timetable: OgForum | null;
    person: { name: string | null } | null;
  }>(PERSON_QUERY, { s: slug, userSlug: hostSlug });

  const forum = data?.timetable;
  if (!forum) {
    return new ImageResponse(ogCard({ emoji: "📚", title: "Topic" }), OG_SIZE);
  }
  const bits = forumCardBits(forum);
  if (!data?.person?.name) {
    return new ImageResponse(
      ogCard({ emoji: bits.emoji, title: forum.name, accent: bits.accent }),
      OG_SIZE,
    );
  }
  return new ImageResponse(
    ogCard({
      kicker: forum.name,
      title: data.person.name,
      accent: bits.accent,
    }),
    OG_SIZE,
  );
}
