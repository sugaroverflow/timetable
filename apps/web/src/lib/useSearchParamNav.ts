"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SetSearchParamOptions = {
  /** Also delete the "page" param so pagination restarts (feed filters). */
  resetPage?: boolean;
  /** Extra params to mutate in the same navigation (e.g. the feed's
   * random-sort shuffle seed). Runs after the key/resetPage updates. */
  mutate?: (params: URLSearchParams) => void;
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
      if (opts?.resetPage) params.delete("page");
      opts?.mutate?.(params);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [router, pathname, searchParams],
  );
}
