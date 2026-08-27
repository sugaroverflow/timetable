"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ASSIGNABLE_ROLES,
  isOwner as hasOwnerRole,
  type AssignableRole,
  type Role,
} from "@timetable/shared";

import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";
import { clientGql } from "@/lib/clientGraphql";
import { roleLabel } from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";
import { useSavedSnapshot } from "@/lib/useSavedSnapshot";

const PERSON_BIO = `query($s: String!, $u: String!) { person(idOrSlug: $s, userId: $u) { name bio image } }`;
const UPDATE_BIO = `mutation($s: String!, $u: String!, $name: String!, $bio: String!, $image: String!) {
  updateMemberBio(idOrSlug: $s, userId: $u, name: $name, bio: $bio, image: $image) { userId }
}`;

const PILL_CLASS: Record<AssignableRole, string> = {
  admin: "pill-admin",
  host: "pill-host",
  elector: "pill-elector",
};

/** Admins can edit any member's per-forum name (2026-08-27), bio (markdown,
 * QA #42) and profile picture (production QA) — the same three fields the
 * member's own profile page edits.
 *
 * Fetched on mount rather than behind a second "Edit bio & photo" click
 * (Ed, 2026-08-27: the People card's Edit should BE the profile editor).
 * Still lazy per card — this only mounts once an admin opens that card's
 * panel, so the People page never loads every profile up front. */
function MemberProfileFields({
  slug,
  userId,
}: {
  slug: string;
  userId: string;
}) {
  const { run, busy: bioBusy } = useGqlAction();
  const [name, setName] = useState("");
  const [bio, setBio] = useState<string | null>(null);
  const [image, setImage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const { saved, markSaved } = useSavedSnapshot([name, bio, image.trim()]);

  useEffect(() => {
    let live = true;
    clientGql<{
      person: { name: string | null; bio: string | null; image: string | null };
    }>(PERSON_BIO, { s: slug, u: userId })
      .then((d) => {
        if (!live) return;
        setName(d.person?.name ?? "");
        setBio(d.person?.bio ?? "");
        setImage(d.person?.image ?? "");
      })
      .catch(() => {
        if (live) setBio("");
      });
    return () => {
      live = false;
    };
  }, [slug, userId]);

  function saveProfile() {
    void run(
      UPDATE_BIO,
      // Image sends "" (not null) when cleared — the API reads an omitted/
      // null image as "leave unchanged" and "" as "remove". A blank name is
      // "leave unchanged" there: nobody gets renamed to nothing.
      {
        s: slug,
        u: userId,
        name: name.trim(),
        bio: bio ?? "",
        image: image.trim(),
      },
      {
        success: "Profile updated",
        errorFallback: "Could not save profile",
        onSuccess: markSaved,
      },
    );
  }

  return (
    <div className="stack" style={{ marginTop: 12, gap: 8 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor={`member-name-${userId}`}>Name</label>
        <input
          id={`member-name-${userId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Renaming re-derives their member slug, so their profile URL
          // follows — old links to it stop resolving.
          placeholder="Their name in this forum"
        />
      </div>
      {bio === null ? (
        <div className="rte" style={{ minHeight: 420 }} aria-busy="true" />
      ) : (
        // Same editor as the topic composers and the profile About
        // field (launch QA 2026-07-27); markdown stays underneath.
        <RichTextEditor
          value={bio}
          onChange={setBio}
          placeholder="Member bio"
        />
      )}
      <ImageUploadField
        id={`member-image-${userId}`}
        label="Profile image"
        hint="Square works best — shown as a small round avatar. 256×256px is plenty; up to 5 MB."
        value={image}
        onChange={setImage}
        purpose="profile-image"
        onUploadingChange={setUploadingImage}
      />
      <div className="row">
        <button
          className="btn btn-primary"
          type="button"
          onClick={saveProfile}
          disabled={bioBusy || bio === null || uploadingImage}
        >
          {uploadingImage
            ? "Uploading…"
            : bioBusy
              ? "Saving…"
              : saved
                ? "Saved"
                : "Save"}
        </button>
      </div>
    </div>
  );
}

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
  const isOwner = hasOwnerRole(initialRoles as Role[]);
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [busy, setBusy] = useState(false);
  const { saved, markSaved } = useSavedSnapshot(roles);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function save() {
    setBusy(true);
    const res = await clientApi(`/api/memberships/${membershipId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({
        roles: roles.filter((r) => r !== "owner"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      markSaved();
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
          {email ? <div className="hint">{email}</div> : null}
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

      <MemberProfileFields slug={slug} userId={userId} />
    </div>
  );
}
