"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

/** My Topics (QA 2026-07-29): the new-topic card hides behind one big
 * "Create New Topic" button above the heading; pressing it swaps the
 * button for the card (the app-wide reveal-in-place rule). */
export function CreateTopicReveal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-create"
        onClick={() => setOpen(true)}
      >
        <Plus size={20} aria-hidden /> Create New Topic
      </button>
    );
  }
  return <>{children}</>;
}
