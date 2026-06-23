"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($name: String, $bio: String) {
  updateMyProfile(name: $name, bio: $bio) { id }
}`;

export function ProfileForm({
  name: initialName,
  bio: initialBio,
}: {
  name: string | null;
  bio: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await clientGql(MUTATION, { name, bio });
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save profile");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Profile</h2>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="bio">About</label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A sentence or two about you."
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : saved ? "Saved" : "Save profile"}
      </button>
    </form>
  );
}
