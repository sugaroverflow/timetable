"use client";

import { createContext, useContext, useState } from "react";

import type { ManagedTopic } from "@/lib/feedTypes";

import { TopicEditForm } from "./TopicEditForm";

type EditableTopic = Pick<
  ManagedTopic,
  "id" | "title" | "bodyMd" | "coverImageUrl"
>;

const Ctx = createContext<{
  editing: boolean;
  setEditing(v: boolean): void;
} | null>(null);

/** Edit toggles (Host/AdminTopicActions, ManageControls) reach the scope's
 * state through this; null outside a scope. */
export function useTopicEditing() {
  return useContext(Ctx);
}

/**
 * Edit-in-place for topic cards (QA 2026-07-29): while editing, the card's
 * rendered content (title/cover/body in `content`) is REPLACED by the edit
 * form — edit affordances swap the content they edit, never stack a
 * composer beneath it. `children` (comments, action rows — where the Edit
 * buttons live) stay mounted below.
 */
export function TopicEditScope({
  topic,
  slug,
  content,
  children,
}: {
  topic: EditableTopic;
  slug: string;
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Ctx.Provider value={{ editing, setEditing }}>
      {editing ? (
        <TopicEditForm
          topic={topic}
          slug={slug}
          onDone={() => setEditing(false)}
        />
      ) : (
        content
      )}
      {children}
    </Ctx.Provider>
  );
}
