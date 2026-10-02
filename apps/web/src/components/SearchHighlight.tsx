"use client";

import { useEffect, useRef } from "react";

const HIGHLIGHT_NAME = "topic-search";

function collectRanges(root: Node, needle: string): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const haystack = text.toLowerCase();
    let from = 0;
    for (
      let at = haystack.indexOf(needle, from);
      at !== -1;
      at = haystack.indexOf(needle, from)
    ) {
      const range = new Range();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      ranges.push(range);
      from = at + needle.length;
    }
  }
  return ranges;
}

/** Paints every occurrence of the feed search query inside its children
 * via the CSS Custom Highlight API (styled by `::highlight(topic-search)`
 * in globals.css). Ranges are marked without touching the DOM — critical
 * because topic bodies are markdown-rendered HTML where DOM patching
 * fights React 19's dangerouslySetInnerHTML re-apply (see
 * CollapsibleTopicBody). Unsupported browsers just show no highlight.
 * A MutationObserver re-marks as infinite scroll appends pages. */
export function SearchHighlight({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> })
      .highlights;
    if (!highlights || typeof Highlight === "undefined") return;
    const root = ref.current;
    const needle = q.trim().toLowerCase();
    if (!root || !needle) {
      highlights.delete(HIGHLIGHT_NAME);
      return;
    }

    let frame = 0;
    const mark = () => {
      highlights.set(
        HIGHLIGHT_NAME,
        new Highlight(...collectRanges(root, needle)),
      );
    };
    mark();

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mark);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      highlights.delete(HIGHLIGHT_NAME);
    };
  }, [q]);

  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
