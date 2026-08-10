"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { RoleCheckboxGroup } from "@/components/RoleCheckboxGroup";
import { clientApi } from "@/lib/clientApi";

export function InviteForm({ timetableId }: { timetableId: string }) {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const [roles, setRoles] = useState<string[]>(["elector"]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const list = emails
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setMessage("Add at least one email.");
      return;
    }
    if (roles.length === 0) {
      setMessage("Pick at least one role.");
      return;
    }

    setBusy(true);
    const res = await clientApi(`/api/forums/${timetableId}/invites`, {
      method: "POST",
      body: JSON.stringify({ emails: list, roles }),
    });
    setBusy(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(body.error ?? "Failed to send invites.");
      return;
    }

    const data = (await res.json()) as {
      results: { email: string; status: string }[];
    };
    const added = data.results.filter(
      (r) => r.status === "added" || r.status === "membership_updated",
    ).length;
    const invited = data.results.filter((r) => r.status === "invited").length;
    setMessage(
      `Done — ${added} added now, ${invited} pending invite(s) for users who haven't signed up yet. No emails sent — use "Send invite" on each card when ready.`,
    );
    setEmails("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <CollapsibleSection title="Invite people">
        <p className="muted" style={{ marginTop: 0 }}>
          Existing users are added immediately. Unknown emails get a pending
          invite claimed when they sign up.{" "}
          <strong>Nobody is emailed at this step</strong> — send each person
          their invite email with the &ldquo;Send invite&rdquo; button on their
          card below, once their profile and topics are ready.
        </p>

        <div className="field">
          <label htmlFor="emails">Emails (comma or newline separated)</label>
          <textarea
            id="emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="alex@example.com, sam@example.com"
          />
        </div>

        <div className="field">
          <label>Roles</label>
          <RoleCheckboxGroup value={roles} onChange={setRoles} variant="pill" />
        </div>

        {message ? (
          <p style={{ fontSize: 13 }} className="muted">
            {message}
          </p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add people"}
        </button>
      </CollapsibleSection>
    </form>
  );
}
