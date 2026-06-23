"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const QUERY = `query($id: String!) {
  slotComments(slotId: $id) { id authorName body createdAt }
}`;
const ADD = `mutation($id: String!, $body: String!) {
  addSlotComment(slotId: $id, body: $body) { id }
}`;

type SlotComment = {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export function SlotDiscussion({
  slotId,
  count,
}: {
  slotId: string;
  count: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<SlotComment[] | null>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      try {
        const data = await clientGql<{ slotComments: SlotComment[] }>(QUERY, {
          id: slotId,
        });
        setComments(data.slotComments);
      } catch {
        setComments([]);
      }
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await clientGql(ADD, { id: slotId, body: text });
      setBody("");
      const data = await clientGql<{ slotComments: SlotComment[] }>(QUERY, {
        id: slotId,
      });
      setComments(data.slotComments);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not post");
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn btn-ghost" type="button" onClick={toggle}>
        {open ? "Hide" : "Host chat"} ({count})
      </button>
      {open ? (
        <div className="comments" style={{ marginTop: 8 }}>
          {comments?.map((c) => (
            <div key={c.id} className="comment-meta">
              <span className="who">{c.authorName ?? "Someone"}:</span> {c.body}
            </div>
          ))}
          {comments && comments.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>
              No messages yet.
            </div>
          ) : null}
          <form onSubmit={add} className="inline-form">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message hosts/admins…"
              aria-label="Slot message"
            />
            <button className="btn" type="submit" disabled={pending}>
              Send
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
