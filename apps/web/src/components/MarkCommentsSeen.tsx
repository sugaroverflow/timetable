"use client";

import { useEffect, useRef } from "react";

import { markCommentsSeen } from "@/lib/commentsSeen";

/** Bumps the viewer's per-topic comments-seen watermark on a permalink
 * visit — opening the topic page IS engaging with its discussion
 * (dialogue-first threading, 2026-08-13). Fire-and-forget, like
 * MarkFeedSeen. */
export function MarkCommentsSeen({ topicId }: { topicId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    markCommentsSeen(topicId);
  }, [topicId]);
  return null;
}
