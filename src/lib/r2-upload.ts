import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type UploadFolder = "avatars" | "lessons" | "certificates" | "audio" | "admin";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

let cachedClient: S3Client | null = null;

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Cloudflare R2 uploads.`);
  }
  return value;
}

function getR2Config(): R2Config {
  return {
    endpoint: requiredEnv("CLOUDFLARE_R2_ENDPOINT"),
    accessKeyId: requiredEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    bucket: requiredEnv("CLOUDFLARE_R2_BUCKET"),
    region: process.env.CLOUDFLARE_R2_REGION?.trim() || "auto",
  };
}

function getR2Client(): { client: S3Client; config: R2Config } {
  const config = getR2Config();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return { client: cachedClient, config };
}

function extensionForMimeType(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] ?? "bin";
}

function sanitizeBaseName(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, "");
  const ascii = noExt.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  const normalized = ascii.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "");
  return normalized.slice(0, 60) || "upload";
}

function extractExtension(name: string): string | null {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] ?? null;
}

export function sanitizeFilename(name: string, mimeType: string): string {
  const base = sanitizeBaseName(name);
  const existing = extractExtension(name);
  const fallbackExt = extensionForMimeType(mimeType);
  const extension = existing || fallbackExt;
  return `${base}.${extension}`;
}

export function generateR2ObjectKey(input: {
  folder: UploadFolder;
  originalFilename: string;
  mimeType: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const safeName = sanitizeFilename(input.originalFilename, input.mimeType);
  const unique = randomUUID().slice(0, 8);
  return `${input.folder}/${year}/${month}/${day}/${unique}-${safeName}`;
}

export function buildR2PublicUrl(objectKey: string): string {
  const base = requiredEnv("CLOUDFLARE_R2_PUBLIC_URL").replace(/\/+$/, "");
  return `${base}/${objectKey}`;
}

export async function uploadFileToR2(input: {
  objectKey: string;
  body: Buffer | Uint8Array;
  mimeType: string;
  cacheControl?: string;
}): Promise<{ objectKey: string; publicUrl: string }> {
  const { client, config } = getR2Client();

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.objectKey,
    Body: input.body,
    ContentType: input.mimeType,
    CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
  }));

  return {
    objectKey: input.objectKey,
    publicUrl: buildR2PublicUrl(input.objectKey),
  };
}
