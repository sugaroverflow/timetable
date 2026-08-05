"use client";

import { useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

/** Fold-up section heading (QA 2026-08-03): the calendar's
 * "Set up the schedule" chevron treatment, shared by the Analysis and
 * Forum Settings sections. The chevron + section title is the trigger;
 * everything else (subtitles, filters, tables) lives in the panel so
 * folding tucks it all away. */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="section-toggle">
        {open ? (
          <ChevronDown size={16} aria-hidden />
        ) : (
          <ChevronRight size={16} aria-hidden />
        )}
        <span className="section-title">{title}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <div className="section-body">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
