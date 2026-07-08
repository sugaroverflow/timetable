"use client";

import { useRef, useState } from "react";

import { clientApi } from "@/lib/clientApi";

type UploadPurpose = "profile-image" | "topic-cover" | "timetable-cover" | "timetable-icon";

type SignedUpload = {
  publicUrl: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  maxBytes: number;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Upload failed (${res.status})`;
  } catch {
    return `Upload failed (${res.status})`;
  }
}

export function ImageUploadField({
  id,
  label,
  value,
  onChange,
  purpose,
  timetableIdOrSlug,
  onUploadingChange,
}: {
  id: string;
  label: string;
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
      const signedRes = await clientApi("/api/uploads", {
        method: "POST",
        body: JSON.stringify({
          purpose,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          timetableIdOrSlug,
        }),
      });

      if (!signedRes.ok) throw new Error(await parseError(signedRes));
      const signed = (await signedRes.json()) as SignedUpload;

      // Direct browser→bucket PUT. A TypeError here is almost always the
      // bucket rejecting the origin (CORS not configured for this site) —
      // surface that instead of a bare "Failed to fetch".
      let uploadRes: Response;
      try {
        uploadRes = await fetch(signed.uploadUrl, {
          method: signed.method,
          headers: signed.headers,
          body: file,
        });
      } catch {
        throw new Error(
          "Storage isn't accepting uploads from this site yet (bucket CORS). You can paste an image URL instead.",
        );
      }
      if (!uploadRes.ok) throw new Error(await parseError(uploadRes));

      onChange(signed.publicUrl);
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
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          disabled={uploading}
        />
      </div>
      {value ? (
        <div
          className="media-preview"
          role="img"
          style={{ backgroundImage: `url(${value})` }}
          aria-label={`${label} preview`}
        />
      ) : null}
      <div className="media-status" aria-live="polite">
        {uploading ? <span className="faint">Uploading...</span> : null}
        {error ? <span className="error-text">{error}</span> : null}
      </div>
    </div>
  );
}
