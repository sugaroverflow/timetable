"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";
import { Avatar } from "./Avatar";

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
  canPost = false,
}: {
  slotId: string;
  count: number;
  canPost?: boolean;
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
    <div>
      <button className="slot-expand" type="button" onClick={toggle}>
        {open ? "▾ Hide discussion" : "▸ Discussion & host chat"}
        {count > 0 ? ` · ${count} message${count === 1 ? "" : "s"}` : ""}
      </button>
      {open ? (
        <div className="host-thread">
          {comments?.map((c) => (
            <div key={c.id} className="hc">
              <Avatar name={c.authorName} small />
              <div>
                <div className="hc-name">{c.authorName ?? "Someone"}</div>
                <div className="hc-bubble">{c.body}</div>
              </div>
            </div>
          ))}
          {comments && comments.length === 0 ? (
            <div className="faint" style={{ fontSize: 12, padding: "4px 0" }}>
              No messages yet.
            </div>
          ) : null}
          {canPost ? (
            <div className="hc" style={{ alignItems: "flex-start" }}>
              <Avatar name={null} small />
              <form onSubmit={add} style={{ flex: 1, display: "flex", gap: 8 }}>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Add to the discussion…"
                  aria-label="Slot message"
                  style={{ flex: 1, minHeight: 36 }}
                />
                <button className="btn btn-sm btn-primary" type="submit" disabled={pending}>
                  Send
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
