"use client";

import { Switch } from "@/components/Switch";
import { useGqlAction } from "@/lib/useGqlAction";

const SET_READY = `mutation($id: String!, $ready: Boolean!){ setTopicReady(topicId: $id, ready: $ready){ id } }`;

/** Instant-save "Ready to publish" switch on a host's pending topic — the
 * signal the admins' Pending Topics queue filters on by default. */
export function ReadySwitch({
  topicId,
  ready,
}: {
  topicId: string;
  ready: boolean;
}) {
  const { run, busy } = useGqlAction();

  return (
    <Switch
      checked={ready}
      disabled={busy}
      label="Ready to publish"
      onChange={(next) =>
        void run(
          SET_READY,
          { id: topicId, ready: next },
          {
            success: next
              ? "Marked ready to publish"
              : "Moved back to drafting",
            errorFallback: "Could not update readiness",
          },
        )
      }
    />
  );
}
