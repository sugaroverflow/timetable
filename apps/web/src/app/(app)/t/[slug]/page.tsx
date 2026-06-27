import Link from "next/link";
import { notFound } from "next/navigation";

import { isAdmin, isElector, isHost, type Role } from "@timetable/shared";

import { gqlFetch } from "@/lib/graphql";
import {
  parseTimetableSettings,
  roleLabel,
} from "@/lib/timetableSettings";

type TimetableResult = {
  timetable: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    privacy: string;
    viewerRoles: string[];
    settings: string;
  } | null;
};

const QUERY = `
  query TimetableOverview($idOrSlug: String!) {
    timetable(idOrSlug: $idOrSlug) {
      id
      slug
      name
      description
      privacy
      viewerRoles
      settings
    }
  }
`;

export default async function TimetableOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { timetable } = await gqlFetch<TimetableResult>(QUERY, {
    idOrSlug: slug,
  });
  if (!timetable) notFound();

  const roles = timetable.viewerRoles as Role[];
  const settings = parseTimetableSettings(timetable.settings);
  const base = `/t/${slug}`;

  const elector = isElector(roles);
  const host = isHost(roles);
  const admin = isAdmin(roles);

  const hostLabel = roleLabel(settings.roleLabels, "host");
  const electorLabel = roleLabel(settings.roleLabels, "elector");
  const adminLabel = roleLabel(settings.roleLabels, "admin");

  const privacyLabel =
    timetable.privacy === "public"
      ? "Public"
      : timetable.privacy === "unlisted"
        ? "Unlisted"
        : "Private";

  return (
    <div className="stack">
      {/* Description card */}
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
          {timetable.description ?? "No description yet."}
        </p>
        <p className="faint mono" style={{ fontSize: 12, margin: "10px 0 0" }}>
          {privacyLabel}
          {roles.length > 0
            ? ` · ${roles.map((r) => roleLabel(settings.roleLabels, r)).join(", ")}`
            : ""}
        </p>
      </div>

      {/* Always-visible: Topic feed */}
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>Topic feed</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
          Browse and discuss the topics submitted for this timetable.
        </p>
        <Link href={`${base}/feed`} className="btn btn-primary">
          Go to topic feed →
        </Link>
      </div>

      {/* Elector card */}
      {elector && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>Your availability</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
            As {electorLabel.match(/^[aeiou]/i) ? "an" : "a"}{" "}
            {electorLabel.toLowerCase()}, mark the slots you&apos;re free for
            so organisers can schedule sessions around you.
          </p>
          <Link href={`${base}/calendar`} className="btn btn-primary">
            Mark your availability →
          </Link>
        </div>
      )}

      {/* Host card */}
      {host && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>{hostLabel} tools</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
            Draft and submit your topics, then track their progress on the
            dashboard.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <Link href={`${base}/topics`} className="btn btn-primary">
              My {hostLabel.toLowerCase()} topics →
            </Link>
            <Link href={`${base}/dashboard`} className="btn">
              Dashboard →
            </Link>
          </div>
        </div>
      )}

      {/* Admin card */}
      {admin && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>{adminLabel} tools</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
            Review submitted topics, check the activity log, and manage
            timetable settings.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <Link href={`${base}/moderation`} className="btn btn-primary">
              Moderation queue →
            </Link>
            <Link href={`${base}/activity`} className="btn">
              Activity log →
            </Link>
            <Link href={`${base}/settings`} className="btn">
              Settings →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
