"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { isOwner as hasOwnerRole, type Role } from "@timetable/shared";

import { MemberRolesEditor } from "@/components/MemberRolesEditor";
import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";

/** Admin login-email correction (2026-07-29): only works for members who
 * have never signed in (pre-created accounts, invite typos) — the API
 * refuses with a clear message otherwise. */
function ChangeEmailField({
  membershipId,
  email,
}: {
  membershipId: string;
  email: string | null;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [value, setValue] = useState(email ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await clientApi(`/api/memberships/${membershipId}/email`, {
        method: "PATCH",
        body: JSON.stringify({ email: value.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        email?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not update the email");
      toast(`Login email changed to ${body.email}`);
      router.refresh();
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Could not update the email",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
      <div
        className="field"
        style={{ marginBottom: 0, flex: 1, minWidth: 220 }}
      >
        <label htmlFor={`email-${membershipId}`}>Login email</label>
        <input
          id={`email-${membershipId}`}
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button
        className="btn"
        type="button"
        disabled={busy || !value.trim() || value.trim() === (email ?? "")}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Change email"}
      </button>
    </div>
  );
}

/** Admin "Edit" control on a People card (QA #59 — member editing moved
 * here from the Settings dropdown). Expands into the roles + bio editor,
 * with removal from the timetable (round 3). Owners can't be removed. */
export function PersonAdminPanel({
  membershipId,
  userId,
  slug,
  name,
  email,
  roles,
  roleLabels,
}: {
  membershipId: string;
  userId: string;
  slug: string;
  name: string | null;
  email: string | null;
  roles: string[];
  roleLabels?: { admin?: string; host?: string; elector?: string };
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const isOwner = hasOwnerRole(roles as Role[]);

  async function remove() {
    const res = await clientApi(`/api/memberships/${membershipId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast(`${name ?? email ?? "Member"} removed from the forum`);
      startTransition(() => router.refresh());
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toastError(body.error ?? "Could not remove member");
      setConfirming(false);
    }
  }

  if (!open) {
    return (
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 8, width: "100%" }}>
      <MemberRolesEditor
        membershipId={membershipId}
        userId={userId}
        slug={slug}
        name={name}
        email={email}
        roles={roles}
        roleLabels={roleLabels}
      />
      <ChangeEmailField membershipId={membershipId} email={email} />
      <div className="row wrap" style={{ gap: 8 }}>
        {!isOwner ? (
          confirming ? (
            <>
              <span className="faint" style={{ fontSize: 13 }}>
                Remove {name ?? email ?? "this member"} from the forum?
              </span>
              <button
                className="btn"
                type="button"
                style={{ color: "var(--red)" }}
                disabled={pending}
                onClick={() => void remove()}
              >
                Yes, remove
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn btn-ghost"
              type="button"
              style={{ color: "var(--red)" }}
              onClick={() => setConfirming(true)}
            >
              Remove from forum
            </button>
          )
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setOpen(false)}
        >
          Close editor
        </button>
      </div>
    </div>
  );
}
