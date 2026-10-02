"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * topic-draft-recovery (Ed, 2026-08-21): a form whose text outlives the
 * page it is written on.
 *
 * The comment-draft-store keeps half-written COMMENTS in a module-level
 * map, which is enough for a composer that gets unmounted but dies with
 * the JS context. A topic is long-form writing, and the way it gets lost
 * is leaving the page and pressing browser Back - which may be a full
 * page load. So topic composers write to sessionStorage instead: it
 * survives navigation, Back, and a reload, and is dropped when the tab
 * closes, so a draft never lingers for whoever uses the machine next.
 *
 * `initial` is the baseline the form starts from - empty for a new topic,
 * the saved content when editing. A record equal to the baseline is not a
 * draft, so an untouched form stores nothing and typing back to the
 * original clears what was stored.
 */

const PREFIX = "draft:";

function readDraft<T>(key: string): Partial<T> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    // Private mode, storage full, storage disabled: recovery is a
    // convenience, never a precondition for writing.
    return null;
  }
}

function writeDraft(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* see readDraft */
  }
}

function dropDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* see readDraft */
  }
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function useStoredDraft<T extends Record<string, string>>(
  key: string,
  initial: T,
): {
  values: T;
  patch: (next: Partial<T>) => void;
  /** A stored draft was put back — worth telling the writer. */
  restored: boolean;
  /** Sent, saved, or thrown away: forget it and reset the fields. */
  discard: () => void;
} {
  const [values, setValues] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  // The baseline is fixed at mount: an edit form's saved content must not
  // move under the draft comparison when the server re-renders.
  const baseline = useRef(initial);

  // Restore AFTER mount, never during render — the server rendered the
  // empty form, so filling it in during hydration would be a mismatch.
  useEffect(() => {
    const stored = readDraft<T>(key);
    if (!stored) return;
    setValues((current) =>
      // Only while untouched, so a fast first keystroke is never clobbered.
      same(current, baseline.current)
        ? { ...baseline.current, ...stored }
        : current,
    );
    setRestored(true);
  }, [key]);

  // Settle before writing: a keystroke-by-keystroke serialise of a long
  // body is real jank for no benefit.
  useEffect(() => {
    if (same(values, baseline.current)) {
      dropDraft(key);
      return;
    }
    const id = setTimeout(() => writeDraft(key, values), 300);
    return () => clearTimeout(id);
  }, [key, values]);

  const patch = useCallback(
    (next: Partial<T>) => setValues((v) => ({ ...v, ...next })),
    [],
  );

  const discard = useCallback(() => {
    dropDraft(key);
    setValues(baseline.current);
    setRestored(false);
  }, [key]);

  return { values, patch, restored, discard };
}
