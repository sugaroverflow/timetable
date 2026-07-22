"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientApi } from "@/lib/clientApi";
import { roleLabel, type RoleLabels } from "@/lib/timetableSettings";

const ASSIGNABLE = ["admin", "host", "elector"] as const;

/**
 * Admin "Add person" (product feedback round 2): pre-creates the account
 * silently — no email is sent until the admin presses Send invite on the
 * member's card, after populating their profile and topics.
 */
export function AddPersonForm({
  timetableId,
  roleLabels,
}: {
  timetableId: string;
  roleLabels: RoleLabels | undefined;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["host"]);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || roles.length === 0 || busy) return;
    setBusy(true);
    try {
      const res = await clientApi(`/api/timetables/${timetableId}/people`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          roles,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toastError(body.error ?? "Could not add person");
        return;
      }
      setName("");
      setEmail("");
      toast("Person added — send their invite when they're set up");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3 style={{ marginTop: 0, fontSize: 16 }}>Add a person</h3>
      <p className="faint" style={{ marginTop: 0, fontSize: 12 }}>
        Creates their account right away — no email goes out until you press
        “Send invite” on their card, so you can set up their profile and
        topics first.
      </p>
      <div className="field">
        <label htmlFor="add-person-name">Name</label>
        <input
          id="add-person-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
        />
      </div>
      <div className="field">
        <label htmlFor="add-person-email">Email</label>
        <input
          id="add-person-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ada@example.com"
        />
      </div>
      <div className="field">
        <label>Roles</label>
        <div className="row" style={{ gap: 12 }}>
          {ASSIGNABLE.map((role) => (
            <label
              key={role}
              className="row"
              style={{ gap: 5, alignItems: "center", fontSize: 13 }}
            >
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
                style={{ width: "auto" }}
              />
              {roleLabel(roleLabels, role)}
            </label>
          ))}
        </div>
      </div>
      <button
        className="btn btn-primary"
        type="submit"
        disabled={busy || pending}
      >
        {busy ? "Adding…" : "Add person"}
      </button>
    </form>
  );
}
