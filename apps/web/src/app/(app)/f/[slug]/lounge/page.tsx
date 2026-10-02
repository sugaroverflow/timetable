import { notFound } from "next/navigation";

import { isAdmin, type Role } from "@timetable/shared";

import { LoungeRoom } from "@/components/LoungeRoom";
import { MarkLoungeSeen } from "@/components/MarkLoungeSeen";
import { gqlFetch } from "@/lib/graphql";
import { LOUNGE_QUERY, type LoungePageData } from "@/lib/loungeThread";
import { parseTimetableSettings, roleLabel } from "@/lib/timetableSettings";

const FORUM_QUERY = `query LoungeForum($s: String!) {
  timetable: forum(idOrSlug: $s) { viewerRoles settings }
  me { id }
}`;

type ForumData = {
  timetable: { viewerRoles: string[]; settings: string | null } | null;
  me: { id: string } | null;
};

/** A conversation id from `?c=` (digest and notification links). */
function conversationParam(raw: string | undefined): string | null {
  return raw && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

/**
 * The {host} Lounge (docs/host-lounge-plan.md, 2026-09-30): one
 * hosts-and-admins-only room per forum. The API answers `lounge: null`
 * to anyone who can't enter it — electors, or any forum that hasn't
 * switched it on — and the page is then simply not found, so the room
 * never announces itself to people it's closed to.
 */
export default async function LoungePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const focusId = conversationParam((await searchParams).c);
  const [forum, room] = await Promise.all([
    gqlFetch<ForumData>(FORUM_QUERY, { s: slug }),
    gqlFetch<{ lounge: LoungePageData | null }>(LOUNGE_QUERY, {
      s: slug,
      cursor: null,
      c: focusId,
    }),
  ]);
  if (!forum.timetable || !forum.me || !room.lounge) notFound();

  const settings = parseTimetableSettings(forum.timetable.settings);
  return (
    <>
      <MarkLoungeSeen slug={slug} />
      {/* Keyed by the linked conversation: a timestamp or notification
          link to another `?c=` is a same-route navigation, and the room
          must start over to bring that conversation in. */}
      <LoungeRoom
        key={focusId ?? "room"}
        slug={slug}
        initial={room.lounge}
        focusId={focusId}
        hostLabel={roleLabel(settings.roleLabels, "host")}
        adminLabel={roleLabel(settings.roleLabels, "admin")}
        viewerId={forum.me.id}
        isAdmin={isAdmin(forum.timetable.viewerRoles as Role[])}
        roleLabels={settings.roleLabels}
      />
    </>
  );
}
