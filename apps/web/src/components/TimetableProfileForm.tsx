"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($s: String!, $name: String, $desc: String, $privacy: String, $cd: String) {
  updateTimetableProfile(idOrSlug: $s, name: $name, description: $desc, privacy: $privacy, customDomain: $cd) { id }
}`;

export function TimetableProfileForm({
  slug,
  name: initialName,
  description: initialDescription,
  privacy: initialPrivacy,
  customDomain: initialCustomDomain,
}: {
  slug: string;
  name: string;
  description: string | null;
  privacy: string;
  customDomain: string | null;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [privacy, setPrivacy] = useState(initialPrivacy);
  const [customDomain, setCustomDomain] = useState(initialCustomDomain ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await clientGql(MUTATION, {
        s: slug,
        name,
        desc: description,
        privacy,
        cd: customDomain,
      });
      setSaved(true);
      toast("Timetable profile saved");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Timetable profile</h2>
      <div className="field">
        <label htmlFor="tt-name">Name</label>
        <input
          id="tt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tt-desc">Description</label>
        <textarea
          id="tt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tt-privacy">Visibility</label>
        <select
          id="tt-privacy"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value)}
        >
          <option value="private">Private — members only</option>
          <option value="public">Public — anyone can read</option>
          <option value="deactivated">Deactivated — admins only</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="tt-domain">Custom domain</label>
        <input
          id="tt-domain"
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
          placeholder="timetable.2026.newspeak.house"
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
