"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Topic body that collapses to its first paragraph on feed cards (QA
 * 2026-07-27), expanding on click. "First paragraph" = the first block
 * element of the rendered markdown, so the collapsed CSS just hides the
 * later siblings — no HTML slicing. The card server-renders collapsed
 * (hiding nothing when there's only one block), and the toggle appears
 * after hydration only when there is actually more to show.
 */
export function CollapsibleTopicBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);

  useLayoutEffect(() => {
    setCollapsible((ref.current?.children.length ?? 0) > 1);
  }, [html]);

  return (
    <>
      <div
        ref={ref}
        className={`topic-body${expanded ? "" : " topic-body-collapsed"}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {collapsible ? (
        <button
          type="button"
          className="topic-body-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} aria-hidden /> Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden /> Show more
            </>
          )}
        </button>
      ) : null}
    </>
  );
}
