"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

/** My Topics: the new-topic card hides behind a "Propose New Topic"
 * button under the heading — same treatment as the calendar's "Propose a
 * different time" (QA 2026-08-03; was a full-width banner above it);
 * pressing it swaps the button for the card (reveal-in-place rule). */
export function CreateTopicReveal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        style={{ alignSelf: "flex-start" }}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} aria-hidden /> Propose New Topic
      </button>
    );
  }
  return <>{children}</>;
}
