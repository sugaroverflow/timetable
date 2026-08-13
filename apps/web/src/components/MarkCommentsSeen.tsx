"use client";

import { useEffect, useRef } from "react";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($id: String!){ markCommentsSeen(topicId: $id) }`;

/** Bumps the viewer's per-topic comments-seen watermark on a permalink
 * visit — opening the topic page IS engaging with its discussion
 * (dialogue-first threading, 2026-08-13). Fire-and-forget, like
 * MarkFeedSeen. */
export function MarkCommentsSeen({ topicId }: { topicId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    clientGql(MUTATION, { id: topicId }).catch(() => {
      // Non-fatal: the watermark just stays where it was.
    });
  }, [topicId]);
  return null;
}
