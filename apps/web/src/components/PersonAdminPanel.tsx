"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MemberRolesEditor } from "@/components/MemberRolesEditor";
import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";

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
  const isOwner = roles.includes("owner");

  async function remove() {
    const res = await clientApi(`/api/memberships/${membershipId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast(`${name ?? email ?? "Member"} removed from the timetable`);
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
      <div className="row wrap" style={{ gap: 8 }}>
        {!isOwner ? (
          confirming ? (
            <>
              <span className="faint" style={{ fontSize: 13 }}>
                Remove {name ?? email ?? "this member"} from the timetable?
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
              Remove from timetable
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
