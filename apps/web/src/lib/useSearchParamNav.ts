"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SetSearchParamOptions = {
  /** Extra params to mutate in the same navigation (e.g. the feed's
   * random-sort shuffle seed). Runs after the key update. */
  mutate?: (params: URLSearchParams) => void;
  /** router.replace instead of push — for keystroke-driven params (the
   * search box), so typing doesn't pile up history entries. */
  replace?: boolean;
};

/**
 * The one URL-param navigation used by the filter controls: copy the current
 * search params, set `key` (or delete it when `value` is ""), optionally
 * reset pagination, and push the result on the current pathname (bare
 * pathname when no params remain).
 */
export function useSetSearchParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, value: string, opts?: SetSearchParamOptions) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      opts?.mutate?.(params);
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      // Filters refine the view in place — never yank the user back to
      // the top of the page (Analysis activity table, QA 2026-08-10).
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}
