"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";
import { formatShortDate } from "@/lib/dates";

/** Invite state + send/resend action for a member card (round 2): admins
 * add people silently, populate their account, then send the email here. */
export function InviteSendButton({
  membershipId,
  email,
  inviteSentAt,
}: {
  membershipId: string;
  email: string | null;
  inviteSentAt: string | null;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await clientApi(`/api/memberships/${membershipId}/invite`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toastError(body.error ?? "Could not send the invite");
        return;
      }
      toast(`Invite sent${email ? ` to ${email}` : ""}`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row" style={{ gap: 8, alignItems: "center" }}>
      <span className="pill">
        {inviteSentAt
          ? `Invited ${formatShortDate(inviteSentAt)}`
          : "Not invited yet"}
      </span>
      <button
        type="button"
        className="btn"
        onClick={send}
        disabled={!email || busy || pending}
        title={email ? undefined : "Member has no email address"}
      >
        {busy ? "Sending…" : inviteSentAt ? "Resend invite" : "Send invite"}
      </button>
    </span>
  );
}
