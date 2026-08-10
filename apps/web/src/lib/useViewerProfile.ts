"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { clientGql } from "@/lib/clientGraphql";

const PROFILE_QUERY = `
  query ViewerProfile($s: String!) {
    timetable: forum(idOrSlug: $s) { viewerProfile { name image } }
  }
`;

/** The viewer's per-forum profile (name + photo), resolved from the
 * pathname client-side — the AccountMenu pattern (QA 2026-07-28),
 * extracted so comment composers can show the viewer's avatar without
 * threading profile props through every callsite. Re-fetches when
 * ProfileForm broadcasts "profile-updated". Both fields are null outside
 * a forum or before the fetch lands. */
export function useViewerProfile(): {
  slug: string | null;
  name: string | null;
  image: string | null;
} {
  const pathname = usePathname();
  const slug = /^\/f\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
  const [state, setState] = useState<{
    slug: string;
    name: string | null;
    image: string | null;
  } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("profile-updated", bump);
    return () => window.removeEventListener("profile-updated", bump);
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    clientGql<{
      timetable: {
        viewerProfile: { name: string | null; image: string | null } | null;
      } | null;
    }>(PROFILE_QUERY, { s: slug })
      .then((data) => {
        if (cancelled) return;
        const profile = data.timetable?.viewerProfile;
        setState({
          slug,
          name: profile?.name ?? null,
          image: profile?.image ?? null,
        });
      })
      .catch(() => {
        // Not readable or transient failure — the null fallback stands.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, version]);

  const inForum = slug != null && state?.slug === slug;
  return {
    slug,
    name: inForum ? state.name : null,
    image: inForum ? state.image : null,
  };
}
