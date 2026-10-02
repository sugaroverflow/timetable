"use client";

import { Avatar } from "@/components/Avatar";
import { useViewerProfile } from "@/lib/useViewerProfile";

/** A comment composer in the same row shape as posted comments: the
 * viewer's per-forum avatar on the left, the form indented to align with
 * the comment bubbles (QA 2026-08-10). */
export function ComposerRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const profile = useViewerProfile();
  return (
    <div
      className={`comment comment-composer${className ? ` ${className}` : ""}`}
    >
      <Avatar name={profile.name} image={profile.image} small />
      <div className="comment-main">{children}</div>
    </div>
  );
}
