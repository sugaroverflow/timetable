"use client";

import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { CalendarDays, Library, MessageCircle, Shield } from "lucide-react";

import { useCommentsOpen } from "./CommentsOpenScope";

/** One tab on a topic card: a parallel space on the topic — public
 * discussion, {host}-only thread, drafting thread, sessions, scheduling.
 * Icons are keyed (not ReactNode) so server components can describe
 * tabs without crossing the client boundary. */
export type TopicTab = {
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
 * topic-tabs (2026-08-14, generalised from My Topics; named 2026-08-15):
 * two or more tabs render as the horizontal strip, a single one renders
 * bare — exactly what the card showed before tabs existed. When
 * `followCommentsOpen` is set (feed cards), the actions row's 💬 button
 * and the top-composer switch the strip back to the comments tab through
 * the CommentsOpenScope channel, so "open the comments" always lands on
 * visible comments.
 */
export function TopicTabs({
  tabs,
  followCommentsOpen = false,
  stripWhenSingle = false,
}: {
  tabs: TopicTab[];
  followCommentsOpen?: boolean;
  /** Render the strip even for one tab. My Topics sets this so a fresh
   * submitted topic (drafting thread only) wears the same furniture as
   * its published neighbours (Ed, QA 2026-08-16). */
  stripWhenSingle?: boolean;
}) {
  const { requestId, requestToggle } = useCommentsOpen();
  const [tab, setTab] = useState(tabs[0]?.value ?? "comments");
  // Render-phase adjustment (the React "information from previous renders"
  // pattern): every open-the-comments request snaps the strip back to the
  // Comments tab.
  const [seenRequestId, setSeenRequestId] = useState(requestId);
  if (followCommentsOpen && requestId !== seenRequestId) {
    setSeenRequestId(requestId);
    setTab("comments");
  }

  if (tabs.length === 0) return null;
  if (tabs.length === 1 && !stripWhenSingle) return <>{tabs[0]!.pane}</>;

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(String(v))}>
      <Tabs.List className="topic-tabs" aria-label="Topic tabs">
        {tabs.map((s) => {
          const Icon = ICONS[s.icon];
          return (
            // The label is a span so narrow screens can drop it from the
            // UNSELECTED tabs (icon + count only, QA 2026-08-15) — it stays
            // in the accessible name, and `title` covers hover.
            <Tabs.Tab
              key={s.value}
              value={s.value}
              title={s.text}
              // Clicking the Comments tab you are already on opens the
              // tree, and clicking it again folds it back (Ed, QA
              // 2026-08-16) — Base UI fires no value change for a click on
              // the active tab, so the toggle rides the click itself.
              onClick={
                s.value === "comments" && tab === "comments"
                  ? requestToggle
                  : undefined
              }
            >
              <Icon size={13} aria-hidden />
              <span className="tab-text">{s.text}</span>
              {s.badge ? <span className="tab-badge">{s.badge}</span> : null}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
      {tabs.map((s) => (
        <Tabs.Panel key={s.value} value={s.value} className="topic-tab-panel">
          {s.pane}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
