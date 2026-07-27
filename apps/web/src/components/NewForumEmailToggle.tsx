"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($v: Boolean) {
  updateMyNotificationSettings(newForumEmails: $v) { id }
}`;

/** Sysadmin opt-in: email me when any new forum is created. Saves on
 * toggle; a failed save reverts the checkbox. */
export function NewForumEmailToggle({ current }: { current: boolean }) {
  const { toast, toastError } = useToast();
  const [checked, setChecked] = useState(current);
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setChecked(next);
    setBusy(true);
    try {
      await clientGql(MUTATION, { v: next });
      toast(
        next
          ? "You'll be emailed when a forum is created"
          : "New-forum emails off",
      );
    } catch (err) {
      setChecked(!next);
      toastError(
        err instanceof Error ? err.message : "Could not save the preference",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="row" style={{ gap: 8, alignItems: "center" }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(e) => void toggle(e.target.checked)}
        style={{ width: "auto" }}
      />
      Email me when a new forum is created
    </label>
  );
}
