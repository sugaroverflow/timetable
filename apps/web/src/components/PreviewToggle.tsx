"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { PREVIEW_COOKIE } from "@/lib/previewRoles";

export function PreviewToggle({
  on,
  electorLabel,
}: {
  on: boolean;
  electorLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    document.cookie = on
      ? `${PREVIEW_COOKIE}=; path=/; max-age=0`
      : `${PREVIEW_COOKIE}=1; path=/`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
      onClick={toggle}
      disabled={pending}
      title="Preview hides host and admin panels on this device only — it does not change your access."
    >
      {on
        ? `✕ Exit ${electorLabel.toLowerCase()} preview`
        : `👁 View as ${electorLabel.toLowerCase()}`}
    </button>
  );
}
