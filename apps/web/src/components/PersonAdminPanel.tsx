"use client";

import { useState } from "react";

import { MemberRolesEditor } from "@/components/MemberRolesEditor";

/** Admin "Edit" control on a People card (QA #59 — member editing moved
 * here from the Settings dropdown). Expands into the roles + bio editor. */
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
  const [open, setOpen] = useState(false);

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
      <button
        className="btn btn-ghost"
        type="button"
        style={{ alignSelf: "flex-start" }}
        onClick={() => setOpen(false)}
      >
        Close editor
      </button>
    </div>
  );
}
