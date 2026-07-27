"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { RolePills } from "@/components/RolePills";
import { clientGql } from "@/lib/clientGraphql";
import {
  parseTimetableSettings,
  type RoleLabels,
} from "@/lib/timetableSettings";

const ROLES_QUERY = `
  query TopbarRoles($s: String!) {
    timetable(idOrSlug: $s) { viewerRoles settings }
  }
`;

/**
 * The viewer's role pills for the current forum, shown left of the account
 * email (QA 2026-07-27 — moved out of the sidebar head). The topbar renders
 * in the app layout, which doesn't know the forum server-side, so this
 * resolves it from the pathname client-side — same pattern as TopbarBrand.
 * Under a view-as preview the API already answers with the target member's
 * roles, so the pills follow the preview for free.
 */
export function TopbarRoles() {
  const pathname = usePathname();
  const slug = /^\/f\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
  const [state, setState] = useState<{
    slug: string;
    roles: readonly string[];
    labels: RoleLabels | undefined;
  } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    clientGql<{
      timetable: { viewerRoles: string[]; settings: string } | null;
    }>(ROLES_QUERY, { s: slug })
      .then((data) => {
        if (cancelled || !data.timetable) return;
        setState({
          slug,
          roles: data.timetable.viewerRoles,
          labels: parseTimetableSettings(data.timetable.settings).roleLabels,
        });
      })
      .catch(() => {
        // Not readable or transient failure — show no pills.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug || state?.slug !== slug) return null;
  return (
    <span className="topbar-roles">
      <RolePills roles={state.roles} labels={state.labels} />
    </span>
  );
}
