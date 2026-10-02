"use client";

import { useState } from "react";

/**
 * "Saved" as a fact about the CURRENT field values, not a one-way latch.
 *
 * Pass whatever the form would send. `saved` is true only while the fields
 * still match what `markSaved()` last recorded, so the first further edit
 * puts the "Save ..." label back and a second round of edits is obviously
 * savable (Ed, 2026-08-21) - and undoing an edit honestly says "Saved"
 * again. Before that, every one of these forms latched on the first save
 * and read "Saved" for the rest of the visit.
 *
 * Call `markSaved()` from the mutation's `onSuccess`: the handler closes
 * over the values as they stood when the form was submitted, so anything
 * typed while the request was in flight correctly stays unsaved.
 */
export function useSavedSnapshot(values: unknown) {
  const [savedValues, setSavedValues] = useState<string | null>(null);
  const current = JSON.stringify(values);
  return {
    saved: savedValues === current,
    markSaved: () => setSavedValues(current),
  };
}
