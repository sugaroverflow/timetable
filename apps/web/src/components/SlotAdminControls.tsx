"use client";

import { X } from "lucide-react";
import { useState } from "react";

import type { TopicOption } from "@/lib/calendarTypes";
import { useGqlAction } from "@/lib/useGqlAction";

const TAG = `mutation($s: String!, $t: String!) { tagSlotTopic(slotId: $s, topicId: $t) }`;
const UNTAG = `mutation($s: String!, $t: String!) { untagSlotTopic(slotId: $s, topicId: $t) }`;
const DELETE = `mutation($s: String!) { deleteTimeslot(slotId: $s) }`;

export function SlotAdminControls({
  slotId,
  tags,
  topicOptions,
  label = "Admin",
}: {
  slotId: string;
  tags: { id: string; title: string }[];
  topicOptions: TopicOption[];
  label?: string;
}) {
  const { run: runAction, busy } = useGqlAction();
  const [topicId, setTopicId] = useState("");

  function run(
    query: string,
    variables: Record<string, unknown>,
    successMessage: string,
  ) {
    void runAction(query, variables, {
      success: successMessage,
      errorFallback: "Action failed",
    });
  }

  return (
    <div className="row wrap divider-top" style={{ gap: 8, paddingTop: 10 }}>
      <span className="faint" style={{ fontSize: 11 }}>
        {label}:
      </span>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className="pill"
          title="Remove tag"
          disabled={busy}
          onClick={() => run(UNTAG, { s: slotId, t: tag.id }, "Tag removed")}
        >
          {tag.title} <X size={14} aria-hidden />
        </button>
      ))}
      <select
        value={topicId}
        onChange={(e) => setTopicId(e.target.value)}
        style={{ width: "auto" }}
        aria-label="Tag topic"
      >
        <option value="">Tag topic…</option>
        {topicOptions.map((tp) => (
          <option key={tp.id} value={tp.id}>
            {tp.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        disabled={busy || !topicId}
        onClick={() => {
          if (topicId) run(TAG, { s: slotId, t: topicId }, "Topic tagged");
          setTopicId("");
        }}
      >
        Tag
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => {
          if (confirm("Delete this timeslot?"))
            run(DELETE, { s: slotId }, "Slot deleted");
        }}
      >
        Delete slot
      </button>
    </div>
  );
}
