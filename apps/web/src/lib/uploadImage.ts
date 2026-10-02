import { clientApi } from "@/lib/clientApi";

export type UploadPurpose =
  | "profile-image"
  | "topic-cover"
  | "timetable-cover"
  | "timetable-icon"
  | "post-image";

export const ACCEPTED_IMAGE_TYPES =
  "image/png,image/jpeg,image/webp,image/gif,image/avif";

/**
 * Image files carried by a paste or a drop, if any. This is the paste
 * decision in the rich-text editor: any image file → the paste uploads it
 * (and the clipboard's text/HTML is ignored); none → ProseMirror inserts
 * the text through the plain-text parser (#359).
 */
export function imageFiles(
  data: { files: ArrayLike<File> } | null | undefined,
): File[] {
  return Array.from(data?.files ?? []).filter((f) =>
    f.type.startsWith("image/"),
  );
}

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

/**
 * The one upload path (was inline in ImageUploadField until 2026-09-30):
 * ask the API for a signed URL, PUT the file straight to the bucket, and
 * return its public address. Uploaded files are public-read at an
 * unguessable address — never private.
 */
export async function uploadImageFile(
  file: Blob & { name?: string },
  purpose: UploadPurpose,
  timetableIdOrSlug?: string,
): Promise<string> {
  const signedRes = await clientApi("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      purpose,
      filename: file.name ?? "image",
      contentType: file.type,
      size: file.size,
      timetableIdOrSlug,
    }),
  });
  if (!signedRes.ok) throw new Error(await parseError(signedRes));
  const signed = (await signedRes.json()) as SignedUpload;

  // Direct browser→bucket PUT. A TypeError here is almost always the
  // bucket rejecting the origin (CORS not configured for this site) —
  // surface that instead of a bare "Failed to fetch". NB a CSP
  // connect-src miss throws identically (prod outage 2026-08-18) —
  // keep csp.ts's storage source in step with the bucket host.
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
  return signed.publicUrl;
}

/** Longest edge after shrinking — wide enough for any post column. */
const MAX_EDGE = 1600;
/** Files under this and within MAX_EDGE go up untouched. */
const LEAVE_BELOW_BYTES = 1_500_000;

/** The size a MAX_EDGE-bounded copy would be, or null when the image
 * already fits and is small enough to leave alone. */
export function shrunkSize(
  width: number,
  height: number,
  bytes: number,
): { width: number; height: number } | null {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  if (scale === 1 && bytes < LEAVE_BELOW_BYTES) return null;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/**
 * Phone photos are 3–10 MB: re-encode anything large or oversized to at
 * most MAX_EDGE on its long side, as WebP (JPEG where the browser can't
 * encode WebP). GIFs pass through — re-encoding would drop the
 * animation — as does anything the browser can't decode.
 */
export async function shrinkImage(
  file: File,
): Promise<Blob & { name: string }> {
  const named = (blob: Blob, name: string) =>
    Object.assign(blob, { name }) as Blob & { name: string };
  if (file.type === "image/gif") return named(file, file.name);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return named(file, file.name);
  }
  const size = shrunkSize(bitmap.width, bitmap.height, file.size);
  if (!size) {
    bitmap.close();
    return named(file, file.name);
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return named(file, file.name);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const webp = await canvasBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") return named(webp, "image.webp");
  // No WebP encoder (older Safari): JPEG on white, so transparency doesn't
  // turn black.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  const jpeg = await canvasBlob(canvas, "image/jpeg");
  return jpeg ? named(jpeg, "image.jpg") : named(file, file.name);
}
