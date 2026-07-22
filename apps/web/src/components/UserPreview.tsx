"use client";

import { Eye, X } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import { VIEW_AS_COOKIE, viewAsCookieValue } from "@/lib/userPreview";

const START = `mutation($s: String!, $u: String!){ startUserPreview(idOrSlug: $s, userId: $u) }`;
const STOP = `mutation($s: String!, $u: String!){ stopUserPreview(idOrSlug: $s, userId: $u) }`;

function setCookie(slug: string, userId: string) {
  document.cookie = `${VIEW_AS_COOKIE}=${encodeURIComponent(
    viewAsCookieValue(slug, userId),
  )}; path=/t/${slug}`;
}

function clearCookie(slug: string) {
  document.cookie = `${VIEW_AS_COOKIE}=; path=/t/${slug}; max-age=0`;
}

/** "View timetable as [username]" on a People card (admins only, QA #59
 * round 3). Enters a read-only preview: reads resolve as the target member
 * and every mutation is blocked until the preview ends. */
export function UserPreviewStart({
  slug,
  userId,
  name,
}: {
  slug: string;
  userId: string;
  name: string | null;
}) {
  const router = useRouter();
  const { toastError } = useToast();
  const [pending, startTransition] = useTransition();

  async function start() {
    try {
      // Audit first, while we're still acting as ourselves.
      await clientGql(START, { s: slug, u: userId });
      setCookie(slug, userId);
      startTransition(() => {
        router.push(`/t/${slug}/feed`);
        router.refresh();
      });
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Could not start the preview",
      );
    }
  }

  return (
    <button
      className="btn btn-ghost"
      type="button"
      disabled={pending}
      onClick={() => void start()}
      title="Read-only preview of this forum as this member sees it"
    >
      <Eye size={16} aria-hidden /> View as {name ?? "member"}
    </button>
  );
}

/** Persistent exit control in the sidebar while a preview is active. */
export function UserPreviewExit({
  slug,
  userId,
  name,
}: {
  slug: string;
  userId: string;
  name: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function stop() {
    clearCookie(slug);
    // Cookie is gone, so this runs (and is audited) as the real admin.
    await clientGql(STOP, { s: slug, u: userId }).catch(() => {});
    startTransition(() => router.refresh());
  }

  return (
    <button
      className="btn btn-sm btn-primary"
      type="button"
      disabled={pending}
      onClick={() => void stop()}
    >
      <X size={16} aria-hidden /> Exit {name ?? "member"} preview
    </button>
  );
}
