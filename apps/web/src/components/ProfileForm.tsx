"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CONTACT_DETAILS_AUDIENCE, profileAudience } from "@/lib/profileLabels";
import { useGqlAction } from "@/lib/useGqlAction";
import { useSavedSnapshot } from "@/lib/useSavedSnapshot";

const MUTATION = `mutation($s: String!, $name: String, $bio: String, $contactDetails: String, $image: String) {
  updateMyProfile(idOrSlug: $s, name: $name, bio: $bio, contactDetails: $contactDetails, image: $image) { userId }
}`;

/** Edits the viewer's profile in ONE forum (per-forum profiles). One
 * "Profile" (the page title) over Name, Contact Details, About (Ed,
 * 2026-09-30); Contact Details and About each say who can read them. */
export function ProfileForm({
  slug,
  name: initialName,
  bio: initialBio,
  contactDetails: initialContactDetails,
  image: initialImage,
  privacy,
  roles,
}: {
  slug: string;
  name: string | null;
  bio: string | null;
  contactDetails: string | null;
  image: string | null;
  privacy: string;
  /** The viewer's roles here — on a hosts-only forum a host's profile is
   * public and an elector's isn't. */
  roles: string[];
}) {
  const { run, busy } = useGqlAction();
  const [name, setName] = useState(initialName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [contactDetails, setContactDetails] = useState(
    initialContactDetails ?? "",
  );
  const [image, setImage] = useState(initialImage ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const { saved, markSaved } = useSavedSnapshot([
    name,
    bio,
    contactDetails,
    image.trim(),
  ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void run(
      MUTATION,
      // Empty string, not null: the API treats null as "leave unchanged",
      // so clearing the field must send "" for the image to be removed.
      { s: slug, name, bio, contactDetails, image: image.trim() },
      {
        success: "Profile saved",
        errorFallback: "Could not save profile",
        onSuccess: () => {
          markSaved();
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
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Contact Details</label>
        <p className="hint profile-audience">
          <Lock size={12} aria-hidden /> {CONTACT_DETAILS_AUDIENCE}
        </p>
        <RichTextEditor
          value={contactDetails}
          onChange={setContactDetails}
          minHeight={140}
          placeholder="Email, phone, Signal — however members can reach you."
        />
      </div>
      <div className="field">
        <label htmlFor="bio">About</label>
        <p className="hint profile-audience">
          {profileAudience(privacy, roles)}
        </p>
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
