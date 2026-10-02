import { auth } from "@clerk/nextjs/server";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { Role } from "@timetable/shared";

import { calendarNavVisible } from "@/lib/calendarPerms";
import { buildForumGuide } from "@/lib/forumGuide";
import { gqlFetch } from "@/lib/graphql";
import { displayRolesFromCookies } from "@/lib/previewRoles.server";
import { parseTimetableSettings } from "@/lib/timetableSettings";

type Data = {
  timetable: {
    name: string;
    settings: string;
    viewerRoles: string[];
    calendarHasSlots: boolean;
  } | null;
};

const QUERY = `
  query Guide($s: String!) {
    timetable: forum(idOrSlug: $s) { name settings viewerRoles calendarHasSlots }
  }
`;

/** forum-guide (2026-09-30): "How it works" — a short, role-aware map of
 * the forum written for whoever is reading it (content: lib/forumGuide). */
export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  const { timetable } = await gqlFetch<Data>(QUERY, { s: slug });
  if (!timetable) notFound();

  const roles = await displayRolesFromCookies(timetable.viewerRoles as Role[]);
  const settings = parseTimetableSettings(timetable.settings);
  const guide = buildForumGuide({
    base: `/f/${slug}`,
    roles,
    settings,
    isAuthed: Boolean(userId),
    calendarVisible: calendarNavVisible(
      settings,
      roles,
      timetable.calendarHasSlots,
    ),
  });

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="page-title">How {timetable.name} works</h2>
        <p>{guide.summary}</p>
      </div>

      {guide.sections.map((section) => (
        <section
          key={section.id}
          className="stack"
          aria-labelledby={`guide-${section.id}`}
        >
          <h3 id={`guide-${section.id}`} className="section-title">
            {section.heading}
          </h3>
          <ol className="guide-steps">
            {section.steps.map((step) => (
              <li key={step.title} className="guide-step">
                <strong className="guide-step-title">{step.title}</strong>
                <p>{step.body}</p>
                {step.href ? (
                  <Link className="guide-step-link" href={step.href}>
                    {step.linkLabel} <ArrowRight size={14} aria-hidden />
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
