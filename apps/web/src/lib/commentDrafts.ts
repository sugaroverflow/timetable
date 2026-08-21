"use client";

import { useCallback, useState } from "react";

/**
 * comment-draft-store (Ed, 2026-08-21): half-written comments survive
 * their composer being unmounted.
 *
 * topic-tabs unmounts the inactive panel - that is exactly what keeps each
 * tab's fetches lazy - so typing a comment, glancing at the Scheduling tab
 * and coming back used to throw the text away. Drafts therefore live in
 * this module-level map rather than in component state, keyed by WHAT is
 * being written (`draftKey`), and a composer picks its text back up when it
 * remounts. Posting, saving, or cancelling clears the entry; a full page
 * reload is still a clean slate.
 */
const drafts = new Map<string, string>();

export const draftKey = {
  /** A new comment on a topic - one draft per visibility thread. */
  comment: (topicId: string, visibility: string) =>
    `comment:${topicId}:${visibility}`,
  /** A reply forked off a chain message. */
  reply: (commentId: string) => `reply:${commentId}`,
  /** A chain-tail continuation, keyed by the chain's parent comment. */
  chain: (parentId: string) => `chain:${parentId}`,
  /** An edit of an existing comment (topic thread or slot chat). */
  edit: (commentId: string) => `edit:${commentId}`,
  /** Slot chat, one draft per slot per topic lens. */
  slot: (slotId: string, topicId: string | null) =>
    `slot:${slotId}:${topicId ?? ""}`,
};

/** Is unsent text waiting under this key? Composers that open from a
 * button (the Reply box, the inline editor) use this to reopen themselves
 * on remount - otherwise the text would be held but unreachable. */
export function hasDraft(key: string) {
  return drafts.has(key);
}

/** Drop a draft from outside its composer — a parent row toggling its
 * editor shut is discarding the edit, and the composer unmounts before it
 * could clear up after itself. */
export function clearDraft(key: string) {
  drafts.delete(key);
}

/**
 * Draft-backed textarea state, a drop-in for `useState("")`.
 *
 * `initial` is what the field starts with - empty for a new comment, the
 * current body for an edit - and typing back to it drops the draft, so
 * "no change" never counts as one.
 */
export function useDraft(key: string, initial = "") {
  const [value, setValue] = useState(() => drafts.get(key) ?? initial);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      if (next === initial) drafts.delete(key);
      else drafts.set(key, next);
    },
    [key, initial],
  );

  /** Sent, saved, or discarded - drop the draft and reset the field. */
  const clear = useCallback(() => {
    drafts.delete(key);
    setValue(initial);
  }, [key, initial]);

  return [value, set, clear] as const;
}
