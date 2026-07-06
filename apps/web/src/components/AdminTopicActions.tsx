"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;
const ARCHIVE = `mutation($id: String!){ archiveTopicHearts(topicId: $id){ id } }`;

export function AdminTopicActions({ topicId }: { topicId: string }) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  async function unpublish() {
    try {
      await clientGql(UNPUBLISH, { id: topicId });
      toast("Topic unpublished");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function archiveHearts() {
    if (!confirm("Archive all hearts on this topic? This resets its votes."))
      return;
    try {
      await clientGql(ARCHIVE, { id: topicId });
      toast("Hearts archived");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div
      className="row wrap"
      style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}
    >
      <span className="faint" style={{ fontSize: 11 }}>
        Admin:
      </span>
      <button
        className="btn btn-ghost"
        type="button"
        disabled={pending}
        onClick={unpublish}
      >
        Unpublish
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        disabled={pending}
        onClick={archiveHearts}
      >
        Archive hearts
      </button>
    </div>
  );
}
