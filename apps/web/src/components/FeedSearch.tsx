"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** The All Topics search box (?q=): debounced live substring search over
 * title, body, and host name. Rides inside the glass filter pill; replace
 * (not push) navigation so typing doesn't pile up history entries. */
export function FeedSearch({ value }: { value: string }) {
  const setParam = useSetSearchParam();
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The URL is the source of truth (back/forward, cleared filters) — adopt
  // external changes unless the user is mid-keystroke (timer pending).
  useEffect(() => {
    if (timer.current === null) setText(value);
  }, [value]);

  function change(next: string) {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setParam("q", next.trim(), { resetPage: true, replace: true });
    }, 350);
  }

  return (
    <span className="feed-search">
      <Search size={14} aria-hidden />
      <input
        type="search"
        value={text}
        onChange={(e) => change(e.target.value)}
        placeholder="Search"
        aria-label="Search topics"
        enterKeyHint="search"
      />
    </span>
  );
}
