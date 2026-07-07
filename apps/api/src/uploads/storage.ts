import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../env";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

const CONTENT_TYPE_EXTENSIONS = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const uploadPurposes = [
  "profile-image",
  "topic-cover",
  "timetable-cover",
  "timetable-icon",
] as const;

export type UploadPurpose = (typeof uploadPurposes)[number];

export type SignedUpload = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  method: "PUT";
  headers: { "Content-Type": string; "x-amz-acl": "public-read" };
  maxBytes: number;
};

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
  keyPrefix: string;
  forcePathStyle: boolean;
};

export class UploadsNotConfiguredError extends Error {
  constructor() {
    super("Object storage is not configured");
  }
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function isUploadPurpose(value: unknown): value is UploadPurpose {
  return (
    typeof value === "string" &&
    (uploadPurposes as readonly string[]).includes(value)
  );
}

function cleanPrefix(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function storageConfig(): StorageConfig {
  if (!process.env.SPACES_BUCKET) {
    throw new UploadsNotConfiguredError();
  }

  return {
    endpoint: process.env.SPACES_ENDPOINT!,
    region: process.env.SPACES_REGION ?? "us-east-1",
    bucket: process.env.SPACES_BUCKET!,
    accessKeyId: process.env.SPACES_KEY!,
    secretAccessKey: process.env.SPACES_SECRET!,
    publicBaseUrl: process.env.SPACES_PUBLIC_BASE_URL ?? null,
    keyPrefix: cleanPrefix(
      process.env.SPACES_KEY_PREFIX ?? `uploads/${env.nodeEnv}`,
    ),
    forcePathStyle: process.env.SPACES_FORCE_PATH_STYLE === "true",
  };
}

function publicUrl(config: StorageConfig, key: string): string {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/g, "")}/${key}`;
  }

  const endpoint = new URL(config.endpoint);
  if (config.forcePathStyle) {
    return `${endpoint.origin}/${config.bucket}/${key}`;
  }
  return `${endpoint.protocol}//${config.bucket}.${endpoint.host}/${key}`;
}

function contentExtension(contentType: string): string {
  const ext =
    CONTENT_TYPE_EXTENSIONS[
      contentType as keyof typeof CONTENT_TYPE_EXTENSIONS
    ];
  if (!ext) {
    throw new UploadValidationError(
      "Unsupported image type. Use PNG, JPEG, WebP, GIF, or AVIF.",
    );
  }
  return ext;
}

function safeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
}

function validateUpload(args: {
  filename: unknown;
  contentType: unknown;
  size: unknown;
}): { contentType: string; extension: string } {
  if (typeof args.filename !== "string" || args.filename.trim().length === 0) {
    throw new UploadValidationError("Filename is required");
  }
  if (typeof args.contentType !== "string") {
    throw new UploadValidationError("Content type is required");
  }
  if (
    typeof args.size !== "number" ||
    !Number.isFinite(args.size) ||
    args.size <= 0
  ) {
    throw new UploadValidationError("File size is required");
  }
  if (args.size > env.uploadMaxImageBytes) {
    throw new UploadValidationError(
      `Image must be ${Math.floor(env.uploadMaxImageBytes / (1024 * 1024))} MB or smaller`,
    );
  }

  return {
    contentType: args.contentType,
    extension: contentExtension(args.contentType),
  };
}

export async function createSignedUpload(args: {
  purpose: UploadPurpose;
  userId: string;
  timetableId?: string;
  filename: unknown;
  contentType: unknown;
  size: unknown;
}): Promise<SignedUpload> {
  const config = storageConfig();
  const { contentType, extension } = validateUpload(args);
  const ownerSegments =
    args.purpose === "profile-image"
      ? ["users", safeKeySegment(args.userId)]
      : [
          "timetables",
          safeKeySegment(args.timetableId ?? "unknown"),
          safeKeySegment(args.userId),
        ];
  const key = [
    config.keyPrefix,
    args.purpose,
    ...ownerSegments,
    `${randomUUID()}.${extension}`,
  ]
    .filter(Boolean)
    .join("/");

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    ACL: "public-read",
  });

  return {
    key,
    publicUrl: publicUrl(config, key),
    uploadUrl: await getSignedUrl(client, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    }),
    method: "PUT",
    headers: { "Content-Type": contentType, "x-amz-acl": "public-read" },
    maxBytes: env.uploadMaxImageBytes,
  };
}
