"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

/** Furniture that must never be the LAST thing in a preview — a fold
 * right after a heading or rule would tease content it doesn't show. */
const FURNITURE_TAGS = /^(H[1-6]|HR)$/;
/** CommonMark starts a NEW list when the bullet marker changes, so one
 * visual list can render as several consecutive ULs/OLs — absorb the whole
 * run so the fold never lands mid-list (QA 2026-07-27). */
const LIST_TAGS = /^(UL|OL)$/;

/** Bodies shorter than this never fold (QA 2026-07-28). */
const MIN_FOLD_TOTAL = 1000;
/** The preview keeps whole blocks until it has roughly this much text —
 * a one-sentence opener pulls its following paragraphs in. */
const PREVIEW_TARGET = 500;
/** Don't fold just to hide a trivial tail. */
const MIN_HIDDEN = 300;

const textLen = (el: Element): number => (el.textContent ?? "").length;

/**
 * Index of the first hidden child when collapsed, or children.length for
 * "never fold". Character-budgeted (QA 2026-07-28): short bodies render in
 * full, previews accumulate whole blocks to ~PREVIEW_TARGET chars (a
 * consecutive UL/OL run counts as one unit; headings/rules can't end a
 * preview), and a fold that would hide < MIN_HIDDEN chars is dropped.
 */
function cutoffIndex(el: HTMLElement): number {
  const kids = Array.from(el.children);
  const total = kids.reduce((sum, kid) => sum + textLen(kid), 0);
  if (total < MIN_FOLD_TOTAL) return kids.length;

  let i = 0;
  let shown = 0;
  while (i < kids.length) {
    if (LIST_TAGS.test(kids[i]!.tagName)) {
      while (i < kids.length && LIST_TAGS.test(kids[i]!.tagName)) {
        shown += textLen(kids[i]!);
        i++;
      }
    } else {
      shown += textLen(kids[i]!);
      i++;
    }
    const lastShown = kids[i - 1]!;
    if (shown >= PREVIEW_TARGET && !FURNITURE_TAGS.test(lastShown.tagName)) {
      break;
    }
  }
  if (total - shown < MIN_HIDDEN) return kids.length;
  return i;
}

/**
 * Topic body (or People-page bio) that collapses long text to a ~500-char
 * preview on cards, expanding on click; bodies under ~1000 chars never
 * fold (QA 2026-07-28). Before hydration a CSS class shows just the first
 * block; after hydration the character-budgeted cutoff above takes over
 * via inline styles — React never reconciles inside the innerHTML
 * container, so the DOM is ours to toggle. The button appears only when
 * something is hidden.
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
