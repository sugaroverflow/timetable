"use client";

import { useState } from "react";

import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($s: String!, $name: String, $bio: String, $image: String) {
  updateMyProfile(idOrSlug: $s, name: $name, bio: $bio, image: $image) { userId }
}`;

/** Edits the viewer's profile in ONE forum (per-forum profiles). */
export function ProfileForm({
  slug,
  name: initialName,
  bio: initialBio,
  image: initialImage,
}: {
  slug: string;
  name: string | null;
  bio: string | null;
  image: string | null;
}) {
  const { run, busy } = useGqlAction();
  const [name, setName] = useState(initialName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [image, setImage] = useState(initialImage ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  // "Saved" describes the CURRENT field values, not a one-way latch: we
  // remember what was last saved, so the first further edit puts "Save
  // profile" back and a second round of edits is savable (Ed, 2026-08-21).
  const [savedValues, setSavedValues] = useState<string | null>(null);
  const values = JSON.stringify([name, bio, image.trim()]);
  const saved = savedValues === values;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Snapshot what we're sending — the fields may move on while it's away.
    const sent = values;
    void run(
      MUTATION,
      // Empty string, not null: the API treats null as "leave unchanged",
      // so clearing the field must send "" for the image to be removed.
      { s: slug, name, bio, image: image.trim() },
      {
        success: "Profile saved",
        errorFallback: "Could not save profile",
        onSuccess: () => {
          setSavedValues(sent);
          // The topbar AccountMenu caches this forum's avatar for the life
          // of the app layout — tell it the profile changed (QA 2026-07-28:
          // a new photo didn't show top right until a hard reload).
          window.dispatchEvent(new Event("profile-updated"));
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 className="section-title" style={{ marginBottom: 10 }}>
        Profile
      </h2>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bio">About</label>
        {/* Same editor and size as the topic composers — one consistent
         * writing surface everywhere (launch QA 2026-07-27). Markdown
         * stays the stored format underneath. */}
        <RichTextEditor
          value={bio}
          onChange={setBio}
          placeholder="A sentence or two about you."
        />
      </div>
      <ImageUploadField
        id="image"
        label="Profile image"
        hint="Square works best — it's shown as a small round avatar. 256×256px is plenty; up to 5 MB."
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
