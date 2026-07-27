import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LESSON_PACK_UPLOAD_LIMITS } from "@/lib/lesson-pack-import/upload-limits";
import { normalizeLessonPackMimeType } from "@/lib/lesson-pack-import/upload-errors";

export type LessonPackStorageProvider = "r2" | "local";

export type StoredObjectMeta = {
  objectKey: string;
  sizeBytes: number;
  contentType?: string;
  etag?: string;
};

export type SignedUploadTarget = {
  provider: LessonPackStorageProvider;
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

const PRIVATE_PREFIX = "lesson-packs/private";

const LOCAL_SIGNING_SECRET = () =>
  process.env.LESSON_PACK_UPLOAD_SIGNING_SECRET?.trim()
  || process.env.NEXTAUTH_SECRET?.trim()
  || "starliz-lesson-pack-dev-secret";

let cachedClient: S3Client | null = null;

function r2Env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function isR2Configured(): boolean {
  const endpoint = r2Env("CLOUDFLARE_R2_ENDPOINT")
    || (r2Env("CLOUDFLARE_R2_ACCOUNT_ID")
      ? `https://${r2Env("CLOUDFLARE_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`
      : null);
  const bucket = r2Env("CLOUDFLARE_R2_BUCKET") || r2Env("CLOUDFLARE_R2_BUCKET_NAME");
  return Boolean(
    endpoint
    && bucket
    && r2Env("CLOUDFLARE_R2_ACCESS_KEY_ID")
    && r2Env("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  );
}

/** True on Vercel / explicitly forced production lesson-pack storage. */
export function isDeployedLessonPackRuntime(): boolean {
  return process.env.VERCEL === "1"
    || process.env.LESSON_PACK_REQUIRE_R2 === "true"
    || process.env.LESSON_PACK_REQUIRE_R2 === "1";
}

export function getLessonPackStorageProvider(): LessonPackStorageProvider {
  return isR2Configured() ? "r2" : "local";
}

/**
 * Deployed Admin uploads must use Cloudflare R2 signed PUTs.
 * Never silently fall back to the application server / local disk.
 */
export function assertLessonPackStorageForRuntime(): LessonPackStorageProvider {
  const provider = getLessonPackStorageProvider();
  if (isDeployedLessonPackRuntime() && provider !== "r2") {
    throw new Error("Cloudflare R2 is not configured for deployed lesson-pack uploads.");
  }
  return provider;
}

function getR2Client(): { client: S3Client; bucket: string } {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 is not configured for private lesson-pack storage.");
  }
  const endpoint = r2Env("CLOUDFLARE_R2_ENDPOINT")
    || `https://${r2Env("CLOUDFLARE_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  const bucket = (r2Env("CLOUDFLARE_R2_BUCKET") || r2Env("CLOUDFLARE_R2_BUCKET_NAME"))!;
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: r2Env("CLOUDFLARE_R2_REGION") || "auto",
      endpoint: endpoint!,
      credentials: {
        accessKeyId: r2Env("CLOUDFLARE_R2_ACCESS_KEY_ID")!,
        secretAccessKey: r2Env("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!,
      },
      // AWS SDK v3 defaults can attach flexible checksum headers that browsers do not
      // send on XHR PUT, which breaks R2 signature validation / CORS preflight.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return { client: cachedClient, bucket };
}

export function buildPrivateObjectKey(input: {
  userId: string;
  sessionId: string;
  fileId: string;
  fileName: string;
}): string {
  const safe = input.fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120) || "upload.bin";
  return `${PRIVATE_PREFIX}/${input.userId}/${input.sessionId}/${input.fileId}-${safe}`;
}

export function assertPrivateObjectKey(objectKey: string, sessionId: string, userId: string): void {
  const expectedPrefix = `${PRIVATE_PREFIX}/${userId}/${sessionId}/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw new Error("Object key is outside the upload session prefix.");
  }
  if (objectKey.includes("..") || objectKey.includes("\\")) {
    throw new Error("Invalid object key.");
  }
}

function localRoot(): string {
  return process.env.LESSON_PACK_TEMP_DIR?.trim()
    || process.env.LESSON_PACK_STORAGE_DIR?.trim()
    || join(tmpdir(), "starliz-lesson-pack-objects");
}

function localPathForKey(objectKey: string): string {
  return join(localRoot(), ...objectKey.split("/"));
}

function signLocalToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", LOCAL_SIGNING_SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyLocalUploadToken(token: string): {
  sessionId: string;
  userId: string;
  objectKey: string;
  mimeType: string;
  maxBytes: number;
  exp: number;
} {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Invalid upload token.");
  const expected = createHmac("sha256", LOCAL_SIGNING_SECRET()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid upload token signature.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    sessionId: string;
    userId: string;
    objectKey: string;
    mimeType: string;
    maxBytes: number;
    exp: number;
  };
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Upload token expired.");
  }
  return payload;
}

export async function createSignedUpload(input: {
  userId: string;
  sessionId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  expectedSizeBytes: number;
  expiresInSeconds?: number;
}): Promise<SignedUploadTarget> {
  const expiresInSeconds = input.expiresInSeconds ?? 15 * 60;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const objectKey = buildPrivateObjectKey(input);
  const contentType = normalizeLessonPackMimeType(input.fileName, input.mimeType);
  const provider = assertLessonPackStorageForRuntime();

  if (provider === "r2") {
    const { client, bucket } = getR2Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
      // Only hoist content-type into the signature so the browser XHR can match exactly.
      signableHeaders: new Set(["content-type"]),
    });
    return {
      provider,
      objectKey,
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      expiresAt,
    };
  }

  const token = signLocalToken({
    sessionId: input.sessionId,
    userId: input.userId,
    objectKey,
    mimeType: contentType,
    maxBytes: Math.min(
      input.expectedSizeBytes || LESSON_PACK_UPLOAD_LIMITS.maxFileBytes,
      LESSON_PACK_UPLOAD_LIMITS.maxFileBytes,
    ),
    exp: Date.now() + expiresInSeconds * 1000,
  });
  return {
    provider: "local",
    objectKey,
    uploadUrl: `/api/admin/lesson-pack-import/direct-put?token=${encodeURIComponent(token)}`,
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    expiresAt,
  };
}

export async function headStoredObject(objectKey: string): Promise<StoredObjectMeta | null> {
  const provider = getLessonPackStorageProvider();
  if (provider === "r2") {
    try {
      const { client, bucket } = getR2Client();
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      return {
        objectKey,
        sizeBytes: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag,
      };
    } catch {
      return null;
    }
  }
  const path = localPathForKey(objectKey);
  if (!existsSync(path)) return null;
  const st = await stat(path);
  return { objectKey, sizeBytes: st.size };
}

export async function deleteStoredObject(objectKey: string): Promise<void> {
  const provider = getLessonPackStorageProvider();
  if (provider === "r2") {
    const { client, bucket } = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    return;
  }
  const path = localPathForKey(objectKey);
  await rm(path, { force: true });
}

export async function downloadStoredObject(objectKey: string): Promise<{
  bytes: Buffer;
  contentType?: string;
  sizeBytes: number;
}> {
  const provider = getLessonPackStorageProvider();
  if (provider === "r2") {
    const { client, bucket } = getR2Client();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    const body = result.Body ? Buffer.from(await result.Body.transformToByteArray()) : Buffer.alloc(0);
    return {
      bytes: body,
      contentType: result.ContentType,
      sizeBytes: result.ContentLength ?? body.length,
    };
  }
  const path = localPathForKey(objectKey);
  const bytes = await readFile(path);
  return { bytes, sizeBytes: bytes.length };
}

/** Download only the leading bytes (for magic-byte / signature checks). */
export async function downloadStoredObjectPrefix(
  objectKey: string,
  maxBytes = 64 * 1024,
): Promise<{ bytes: Buffer; contentType?: string; sizeBytes: number }> {
  const provider = getLessonPackStorageProvider();
  if (provider === "r2") {
    const { client, bucket } = getR2Client();
    const result = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
    }));
    const body = result.Body ? Buffer.from(await result.Body.transformToByteArray()) : Buffer.alloc(0);
    const head = await headStoredObject(objectKey);
    return {
      bytes: body,
      contentType: result.ContentType,
      sizeBytes: head?.sizeBytes ?? body.length,
    };
  }
  const path = localPathForKey(objectKey);
  const st = await stat(path);
  const handle = await readFile(path);
  return {
    bytes: handle.subarray(0, Math.min(handle.length, maxBytes)),
    sizeBytes: st.size,
  };
}

/** Stream a request body into local private storage with incremental size enforcement. */
export async function writeLocalObjectFromStream(input: {
  objectKey: string;
  stream: Readable;
  maxBytes: number;
}): Promise<number> {
  const path = localPathForKey(input.objectKey);
  await mkdir(join(path, ".."), { recursive: true });
  let written = 0;
  const limiter = new Readable({
    read() {},
  });
  input.stream.on("data", (chunk: Buffer) => {
    written += chunk.length;
    if (written > input.maxBytes) {
      input.stream.destroy();
      limiter.destroy(new Error(`File exceeds ${Math.round(input.maxBytes / (1024 * 1024))}MB limit`));
      return;
    }
    limiter.push(chunk);
  });
  input.stream.on("end", () => limiter.push(null));
  input.stream.on("error", (err) => limiter.destroy(err));

  try {
    await pipeline(limiter, createWriteStream(path));
    return written;
  } catch (error) {
    await rm(path, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeLocalObjectFromBuffer(objectKey: string, bytes: Buffer): Promise<number> {
  const path = localPathForKey(objectKey);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, bytes);
  return bytes.length;
}

/** Write bytes to the active private storage provider (R2 or local). Never public. */
export async function putStoredObject(input: {
  objectKey: string;
  bytes: Buffer;
  mimeType?: string;
}): Promise<number> {
  const provider = getLessonPackStorageProvider();
  if (provider === "r2") {
    const { client, bucket } = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Body: input.bytes,
      ContentType: input.mimeType || "application/octet-stream",
    }));
    return input.bytes.length;
  }
  return writeLocalObjectFromBuffer(input.objectKey, input.bytes);
}

export async function cleanupExpiredLocalObjects(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const root = join(localRoot(), PRIVATE_PREFIX);
  if (!existsSync(root)) return 0;
  let cleaned = 0;
  const now = Date.now();

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        const remaining = await readdir(full);
        if (!remaining.length) {
          await rm(full, { recursive: true, force: true }).catch(() => {});
        }
      } else {
        const st = await stat(full);
        if (now - st.mtimeMs > maxAgeMs) {
          await rm(full, { force: true });
          cleaned++;
        }
      }
    }
  }

  await walk(root);
  return cleaned;
}

export function newFileId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}
