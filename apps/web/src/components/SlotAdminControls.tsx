"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import type { TopicOption } from "@/lib/calendarTypes";
import { clientGql } from "@/lib/clientGraphql";

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
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [topicId, setTopicId] = useState("");

  async function run(
    query: string,
    variables: Record<string, unknown>,
    successMessage: string,
  ) {
    try {
      await clientGql(query, variables);
      toast(successMessage);
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div
      className="row wrap divider-top"
      style={{ gap: 8, paddingTop: 10 }}
    >
      <span className="faint" style={{ fontSize: 11 }}>
        {label}:
      </span>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className="pill"
          title="Remove tag"
          disabled={pending}
          onClick={() => run(UNTAG, { s: slotId, t: tag.id }, "Tag removed")}
        >
          {tag.title} ✕
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
        disabled={pending || !topicId}
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
        disabled={pending}
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
