"use client";

import { useEffect, useRef } from "react";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($s: String!){ markFeedSeen(idOrSlug: $s) }`;

/** Bumps the viewer's feed watermark once per feed visit so the "New"
 * highlights reflect activity since the previous visit. Fire-and-forget;
 * the highlights rendered for this visit are unaffected. */
export function MarkFeedSeen({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    clientGql(MUTATION, { s: slug }).catch(() => {
      // Non-fatal: the watermark just stays where it was.
    });
  }, [slug]);
  return null;
}
