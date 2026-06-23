"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function FeedSortControl({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      aria-label="Sort topics"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="hearts">Most hearts</option>
      <option value="comments">Most comments</option>
      <option value="recent">Newest</option>
    </select>
  );
}
