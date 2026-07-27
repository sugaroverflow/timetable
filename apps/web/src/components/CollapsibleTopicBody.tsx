"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

/** Leading furniture that shouldn't count as the preview by itself — a
 * fold right after a heading or rule would show no actual content. */
const LEADING_TAGS = /^(H[1-6]|HR)$/;
/** CommonMark starts a NEW list when the bullet marker changes, so one
 * visual list can render as several consecutive ULs/OLs — absorb the whole
 * run so the fold never lands mid-list (QA 2026-07-27). */
const LIST_TAGS = /^(UL|OL)$/;

/** Index of the first hidden child when collapsed: any leading headings/
 * rules, then the first content block — absorbing a run of consecutive
 * lists as one unit. */
function cutoffIndex(el: HTMLElement): number {
  const kids = el.children;
  let i = 0;
  while (i < kids.length && LEADING_TAGS.test(kids[i]!.tagName)) i++;
  if (i >= kids.length) return kids.length;
  if (LIST_TAGS.test(kids[i]!.tagName)) {
    while (i < kids.length && LIST_TAGS.test(kids[i]!.tagName)) i++;
  } else {
    i++;
  }
  return i;
}

/**
 * Topic body (or People-page bio) that collapses to its first paragraph on
 * cards (QA 2026-07-27), expanding on click. Before hydration a CSS class
 * shows just the first block (no flash, hides nothing when the body is one
 * block); after hydration the cutoff above takes over via inline styles —
 * React never reconciles inside the innerHTML container, so the DOM is
 * ours to toggle. The button appears only when something is hidden.
 */
export function CollapsibleTopicBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [collapsible, setCollapsible] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cutoff = cutoffIndex(el);
    const kids = Array.from(el.children) as HTMLElement[];
    for (const [i, child] of kids.entries()) {
      child.style.display = !expanded && i >= cutoff ? "none" : "";
    }
    setHydrated(true);
    setCollapsible(cutoff < kids.length);
  }, [expanded, html]);

  return (
    <>
      <div
        ref={ref}
        className={`topic-body${hydrated ? "" : " topic-body-collapsed"}`}
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
