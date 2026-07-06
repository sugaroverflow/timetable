"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { PREVIEW_COOKIE } from "@/lib/previewRoles";

export function PreviewToggle({
  on,
  slug,
  electorLabel,
}: {
  on: boolean;
  slug: string;
  electorLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    // Path-scoped so previewing timetable A never affects timetable B.
    const path = `/t/${slug}`;
    if (on) {
      document.cookie = `${PREVIEW_COOKIE}=; path=${path}; max-age=0`;
      // Also clear the site-wide cookie an earlier version of this toggle set.
      document.cookie = `${PREVIEW_COOKIE}=; path=/; max-age=0`;
    } else {
      document.cookie = `${PREVIEW_COOKIE}=1; path=${path}`;
    }
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
      onClick={toggle}
      disabled={pending}
      title="Preview hides host and admin panels for this timetable on this device only — it does not change your access."
    >
      {on
        ? `✕ Exit ${electorLabel.toLowerCase()} preview`
        : `👁 View as ${electorLabel.toLowerCase()}`}
    </button>
  );
}
