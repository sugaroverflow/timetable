"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($s: String!){ markLoungeSeen(idOrSlug: $s) }`;

/** Visiting the {host} Lounge reads it: moves the Lounge read mark (the
 * nav dot, and what counts as news for the digest), then refreshes so the
 * dot clears. Refused while previewing as another member, like every
 * reading mark (last-activity-signals relies on that). */
export function MarkLoungeSeen({ slug }: { slug: string }) {
  const router = useRouter();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    clientGql(MUTATION, { s: slug })
      .then(() => router.refresh())
      .catch(() => {
        // Non-fatal: the dot just stays until the next visit.
      });
  }, [slug, router]);
  return null;
}
