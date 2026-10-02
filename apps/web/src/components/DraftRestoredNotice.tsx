"use client";

/** Says why a form filled itself in (topic-draft-recovery, 2026-08-21).
 * Silently repopulating a composer is startling when you had deliberately
 * abandoned the draft, so the recovery announces itself and offers the
 * way out. */
export function DraftRestoredNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <p className="faint" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
      Unsaved draft restored.{" "}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onDiscard}
      >
        Discard it
      </button>
    </p>
  );
}
