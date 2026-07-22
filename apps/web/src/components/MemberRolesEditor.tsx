/* eslint-disable max-lines-per-function -- audit debt (2026-07-22): decomposition queued — remove this disable when refactoring */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ASSIGNABLE_ROLES, type AssignableRole } from "@timetable/shared";

import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";
import { clientGql } from "@/lib/clientGraphql";
import { roleLabel } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const PERSON_BIO = `query($s: String!, $u: String!) { person(idOrSlug: $s, userId: $u) { bio } }`;
const UPDATE_BIO = `mutation($s: String!, $u: String!, $bio: String!) {
  updateMemberBio(idOrSlug: $s, userId: $u, bio: $bio) { userId }
}`;

const PILL_CLASS: Record<AssignableRole, string> = {
  admin: "pill-admin",
  host: "pill-host",
  elector: "pill-elector",
};

export function MemberRolesEditor({
  membershipId,
  userId,
  slug,
  name,
  email,
  roles: initialRoles,
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
  const { run, busy: bioBusy } = useGqlAction();
  const isOwner = initialRoles.includes("owner");
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bio, setBio] = useState<string | null>(null);
  const [bioOpen, setBioOpen] = useState(false);

  async function openBio() {
    setBioOpen(true);
    if (bio !== null) return;
    try {
      const d = await clientGql<{ person: { bio: string | null } | null }>(
        PERSON_BIO,
        { s: slug, u: userId },
      );
      setBio(d.person?.bio ?? "");
    } catch {
      setBio("");
    }
  }

  function saveBio() {
    void run(
      UPDATE_BIO,
      { s: slug, u: userId, bio: bio ?? "" },
      {
        success: "Bio updated",
        errorFallback: "Could not save bio",
        onSuccess: () => setBioOpen(false),
      },
    );
  }

  function toggleRole(role: string) {
    setSaved(false);
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await clientApi(`/api/memberships/${membershipId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({
        roles: roles.filter((r) => r !== "owner"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      toast("Roles updated");
      router.refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toastError(body.error ?? "Could not update roles");
    }
  }

  return (
    <div className="member-editor">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{name ?? email ?? "Unknown user"}</strong>
          {email ? (
            <div className="faint" style={{ fontSize: 12 }}>
              {email}
            </div>
          ) : null}
        </div>
        {isOwner ? <span className="pill pill-owner">Owner</span> : null}
      </div>

      <div className="row wrap" style={{ marginTop: 10 }}>
        {ASSIGNABLE_ROLES.map((role) => {
          const active = roles.includes(role);
          const locked = isOwner && role === "admin";
          const customLabel = roleLabels?.[role];
          const displayLabel = roleLabel(roleLabels, role);
          const titleAttr = customLabel ? role : undefined;

          return (
            <button
              key={role}
              type="button"
              className={`pill${active ? ` ${PILL_CLASS[role]}` : ""}`}
              style={{
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.6 : 1,
                border: undefined,
                font: "inherit",
              }}
              onClick={() => !locked && toggleRole(role)}
              disabled={locked}
              title={titleAttr}
              aria-pressed={active}
            >
              {displayLabel}
              {active ? " ✓" : ""}
            </button>
          );
        })}
        <button className="btn" type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Admins can edit any member's bio (markdown, QA #42). */}
      <div className="stack" style={{ marginTop: 12, gap: 8 }}>
        {bioOpen ? (
          <>
            <textarea
              value={bio ?? ""}
              onChange={(e) => setBio(e.target.value)}
              placeholder={
                bio === null ? "Loading…" : "Member bio (markdown supported)"
              }
              aria-label="Member bio"
              disabled={bio === null}
            />
            <div className="row">
              <button
                className="btn btn-primary"
                type="button"
                onClick={saveBio}
                disabled={bioBusy || bio === null}
              >
                {bioBusy ? "Saving…" : "Save bio"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setBioOpen(false)}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            className="btn btn-ghost"
            type="button"
            style={{ alignSelf: "flex-start" }}
            onClick={openBio}
          >
            Edit bio
          </button>
        )}
      </div>
    </div>
  );
}
