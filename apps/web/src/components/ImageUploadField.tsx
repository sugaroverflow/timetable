"use client";

import { useRef, useState } from "react";

import {
  ACCEPTED_IMAGE_TYPES,
  uploadImageFile,
  type UploadPurpose,
} from "@/lib/uploadImage";

export function ImageUploadField({
  id,
  label,
  hint,
  value,
  onChange,
  purpose,
  timetableIdOrSlug,
  onUploadingChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange(value: string): void;
  purpose: UploadPurpose;
  timetableIdOrSlug?: string;
  onUploadingChange?(uploading: boolean): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setUploadState(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  async function upload(file: File) {
    setUploadState(true);
    setError(null);

    try {
      onChange(await uploadImageFile(file, purpose, timetableIdOrSlug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadState(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="hint" style={{ margin: "0 0 5px" }}>
          {hint}
        </p>
      ) : null}
      <div className="media-input">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
        />
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          disabled={uploading}
        />
      </div>
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="media-preview" src={value} alt={`${label} preview`} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => onChange("")}
            disabled={uploading}
          >
            Remove image
          </button>
        </>
      ) : null}
      <div className="media-status" aria-live="polite">
        {uploading ? <span className="faint">Uploading...</span> : null}
        {error ? <span className="error-text">{error}</span> : null}
      </div>
    </div>
  );
}
