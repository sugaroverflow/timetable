"use client";

import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { CalendarDays, Library, MessageCircle, Shield } from "lucide-react";

import { useCommentsOpen } from "./CommentsOpenScope";

/** One card section ("activity"): a parallel space on a topic card —
 * public discussion, {host}-only thread, drafting thread, scheduling.
 * Icons are keyed (not ReactNode) so server components can describe
 * sections without crossing the client boundary. */
export type CardSection = {
  value: string;
  icon: "comments" | "host" | "admin" | "schedule";
  text: string;
  /** Count/💙 badge riding the label, e.g. "(12)" or "(2) · 💙 3". */
  badge?: string;
  pane: React.ReactNode;
};

const ICONS = {
  comments: MessageCircle,
  // 📚 not 🔒 (Ed, 2026-08-15): the {host}-only thread is the faculty
  // common room, not a locked box — lucide's shelf of books is the
  // line-art of that emoji, so the strip stays one icon family.
  host: Library,
  admin: Shield,
  schedule: CalendarDays,
} as const;

/**
 * The card-section tab strip (2026-08-14, generalised from My Topics):
 * multiple sections render as horizontal tabs; a single section renders
 * bare — exactly what the card showed before tabs existed. When
 * `followCommentsOpen` is set (feed cards), the actions row's 💬 button
 * and the top-composer switch the strip back to the comments tab through
 * the CommentsOpenScope channel, so "open the comments" always lands on
 * visible comments.
 */
export function CardSectionTabs({
  sections,
  followCommentsOpen = false,
}: {
  sections: CardSection[];
  followCommentsOpen?: boolean;
}) {
  const { requestId } = useCommentsOpen();
  const [tab, setTab] = useState(sections[0]?.value ?? "comments");
  // Render-phase adjustment (the React "information from previous renders"
  // pattern): every open-the-comments request snaps the strip back to the
  // Comments tab.
  const [seenRequestId, setSeenRequestId] = useState(requestId);
  if (followCommentsOpen && requestId !== seenRequestId) {
    setSeenRequestId(requestId);
    setTab("comments");
  }

  if (sections.length === 0) return null;
  if (sections.length === 1) return <>{sections[0]!.pane}</>;

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(String(v))}>
      <Tabs.List className="card-tabs" aria-label="Topic sections">
        {sections.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            // The label is a span so narrow screens can drop it from the
            // UNSELECTED tabs (icon + count only, QA 2026-08-15) — it stays
            // in the accessible name, and `title` covers hover.
            <Tabs.Tab key={s.value} value={s.value} title={s.text}>
              <Icon size={13} aria-hidden />
              <span className="tab-text">{s.text}</span>
              {s.badge ? <span className="tab-badge">{s.badge}</span> : null}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
      {sections.map((s) => (
        <Tabs.Panel key={s.value} value={s.value} className="card-tab-panel">
          {s.pane}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
