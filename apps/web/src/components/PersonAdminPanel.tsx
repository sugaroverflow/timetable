"use client";

import { useState, useTransition, type ReactNode } from "react";
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

/** The three membership-status verbs an admin has on a People card —
 * each is one REST call, a toast, and a refresh of the page. */
type StatusVerb = "deactivate" | "reactivate" | "remove";

function verbToast(verb: StatusVerb, who: string, unpublished: number) {
  if (verb === "remove") return `${who} removed from the forum`;
  if (verb === "reactivate") return `${who} reactivated`;
  return unpublished > 0
    ? `${who} deactivated — ${unpublished} ${unpublished === 1 ? "topic" : "topics"} unpublished`
    : `${who} deactivated`;
}

/** Calls a status verb's route (DELETE for remove, POST for the two
 * member-deactivation verbs), toasts the outcome and refreshes. Resolves
 * true on success so a confirmation row knows whether to fold. */
function useStatusVerb(membershipId: string, who: string) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function call(verb: StatusVerb): Promise<boolean> {
    setBusy(true);
    const res =
      verb === "remove"
        ? await clientApi(`/api/memberships/${membershipId}`, {
            method: "DELETE",
          })
        : await clientApi(`/api/memberships/${membershipId}/${verb}`, {
            method: "POST",
          });
    const body = (await res.json().catch(() => ({}))) as {
      unpublishedCount?: number;
      error?: string;
    };
    setBusy(false);
    if (!res.ok) {
      toastError(body.error ?? `Could not ${verb} member`);
      return false;
    }
    toast(verbToast(verb, who, body.unpublishedCount ?? 0));
    startTransition(() => router.refresh());
    return true;
  }

  return { call, busy: busy || pending };
}

function ConfirmRow({
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  message: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <span className="faint" style={{ fontSize: 13 }}>
        {message}
      </span>
      <button
        className="btn error-text"
        type="button"
        disabled={busy}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
      <button className="btn btn-ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
    </>
  );
}

/** The editor's status verbs: Deactivate (or Reactivate, once deactivated)
 * and Remove, each behind its own confirmation. The deactivate
 * confirmation spells out what happens (member-deactivation, 2026-09-10),
 * including how many live topics come down; the remove one says what
 * removal costs that deactivation doesn't — the comments' bylines. */
function StatusActions({
  membershipId,
  who,
  deactivatedAt,
  publishedTopicCount,
  canDeactivate,
  canRemove,
}: {
  membershipId: string;
  who: string;
  deactivatedAt: string | null;
  publishedTopicCount: number;
  canDeactivate: boolean;
  canRemove: boolean;
}) {
  const [confirming, setConfirming] = useState<"remove" | "deactivate" | null>(
    null,
  );
  const { call, busy } = useStatusVerb(membershipId, who);

  async function run(verb: StatusVerb) {
    if (!(await call(verb))) setConfirming(null);
  }

  if (confirming === "deactivate") {
    const topicsLine =
      publishedTopicCount > 0
        ? ` Their ${publishedTopicCount} published ${publishedTopicCount === 1 ? "topic" : "topics"} will be unpublished.`
        : "";
    return (
      <ConfirmRow
        message={
          <>
            Deactivate {who}? They&rsquo;ll no longer be able to take part, will
            leave the People page, and their email digests will pause.
            {topicsLine} Their comments stay. You can reactivate them any time.
          </>
        }
        confirmLabel={busy ? "Deactivating…" : "Yes, deactivate"}
        busy={busy}
        onConfirm={() => void run("deactivate")}
        onCancel={() => setConfirming(null)}
      />
    );
  }
  if (confirming === "remove") {
    return (
      <ConfirmRow
        message={
          <>
            Remove {who} from the forum? Their comments will lose their name. To
            keep those, deactivate instead.
          </>
        }
        confirmLabel="Yes, remove"
        busy={busy}
        onConfirm={() => void run("remove")}
        onCancel={() => setConfirming(null)}
      />
    );
  }
  return (
    <StatusButtons
      deactivatedAt={deactivatedAt}
      canDeactivate={canDeactivate}
      canRemove={canRemove}
      busy={busy}
      onReactivate={() => void run("reactivate")}
      onConfirm={setConfirming}
    />
  );
}

/** The idle action row: Reactivate acts at once (it's the undo); Deactivate
 * and Remove open their confirmations. */
function StatusButtons({
  deactivatedAt,
  canDeactivate,
  canRemove,
  busy,
  onReactivate,
  onConfirm,
}: {
  deactivatedAt: string | null;
  canDeactivate: boolean;
  canRemove: boolean;
  busy: boolean;
  onReactivate: () => void;
  onConfirm: (verb: "remove" | "deactivate") => void;
}) {
  return (
    <>
      {canDeactivate && deactivatedAt ? (
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy}
          onClick={onReactivate}
        >
          {busy ? "Reactivating…" : "Reactivate"}
        </button>
      ) : null}
      {canDeactivate && !deactivatedAt ? (
        <button
          className="btn btn-ghost error-text"
          type="button"
          onClick={() => onConfirm("deactivate")}
        >
          Deactivate
        </button>
      ) : null}
      {canRemove ? (
        <button
          className="btn btn-ghost error-text"
          type="button"
          onClick={() => onConfirm("remove")}
        >
          Remove from forum
        </button>
      ) : null}
    </>
  );
}

/** Admin "Edit" control on a People card (QA #59 — member editing moved
 * here from the Settings dropdown). Expands into the roles editor plus the
 * member's name/bio/photo fields (open immediately — Ed, 2026-08-27: one
 * click, not two), the login email, deactivation (member-deactivation,
 * 2026-09-10) and removal from the timetable (round 3). "Close editor"
 * discards anything unsaved. Owners can't be deactivated or removed. A
 * deactivated member's card leads with Reactivate — undoing is the common
 * next step, so it isn't buried in the editor. */
export function PersonAdminPanel({
  membershipId,
  userId,
  slug,
  name,
  email,
  roles,
  roleLabels,
  deactivatedAt,
  publishedTopicCount,
  isSelf,
}: {
  membershipId: string;
  userId: string;
  slug: string;
  name: string | null;
  email: string | null;
  roles: string[];
  roleLabels?: { admin?: string; host?: string; elector?: string };
  /** ISO stamp while deactivated, null while active. */
  deactivatedAt: string | null;
  /** How many of their topics are live — the confirmation says what
   * deactivating will take down. */
  publishedTopicCount: number;
  /** The viewer's own card: the API refuses self-deactivation, so don't
   * offer it. */
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOwner = hasOwnerRole(roles as Role[]);
  const who = name ?? email ?? "Member";
  const { call, busy } = useStatusVerb(membershipId, who);

  if (!open) {
    return (
      <div className="row wrap" style={{ gap: 8 }}>
        {deactivatedAt ? (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void call("reactivate")}
          >
            {busy ? "Reactivating…" : "Reactivate"}
          </button>
        ) : null}
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setOpen(true)}
        >
          Edit
        </button>
      </div>
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
        <StatusActions
          membershipId={membershipId}
          who={who}
          deactivatedAt={deactivatedAt}
          publishedTopicCount={publishedTopicCount}
          canDeactivate={!isOwner && !isSelf}
          canRemove={!isOwner}
        />
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
