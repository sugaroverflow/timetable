"use client";

import { useState } from "react";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($name: String, $bio: String, $image: String) {
  updateMyProfile(name: $name, bio: $bio, image: $image) { id }
}`;

export function ProfileForm({
  name: initialName,
  bio: initialBio,
  image: initialImage,
}: {
  name: string | null;
  bio: string | null;
  image: string | null;
}) {
  const { run, busy } = useGqlAction();
  const [name, setName] = useState(initialName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [image, setImage] = useState(initialImage ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      { name, bio, image: image.trim() || null },
      {
        success: "Profile saved",
        errorFallback: "Could not save profile",
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Profile</h2>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bio">About (markdown supported)</label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A sentence or two about you."
        />
      </div>
      <ImageUploadField
        id="image"
        label="Profile image URL"
        value={image}
        onChange={setImage}
        purpose="profile-image"
        onUploadingChange={setUploadingImage}
      />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={busy || uploadingImage}
      >
        {uploadingImage
          ? "Uploading…"
          : busy
            ? "Saving…"
            : saved
              ? "Saved"
              : "Save profile"}
      </button>
    </form>
  );
}
