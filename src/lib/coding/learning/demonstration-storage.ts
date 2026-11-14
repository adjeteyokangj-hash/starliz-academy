import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { demonstrationAttachmentSchema, demonstrationMetadataSchema, DEMONSTRATION_MAX_BYTES, type DemonstrationAttachment } from "./demonstration-contract";
import { verifyDecodedDemonstration } from "./demonstration-validation";

function signingSecret() { const secret = process.env.CODING_DEMONSTRATION_SECRET ?? process.env.NEXTAUTH_SECRET; if (!secret || secret.length < 32) throw new Error("Private demonstration signing is not configured."); return secret; }
const ownerScope = (childId: string) => createHash("sha256").update(childId).digest("hex");
function objectKey(childId: string, id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid demonstration identifier."); return `coding-private-media/${ownerScope(childId)}/${id}.webm`; }
function encryptionContext(childId: string, id: string) { return Buffer.from(`starliz-private-demo-v1\n${childId}\n${id}`); }
export function encryptDemonstration(bytes: Uint8Array, childId: string, id: string) {
  const context = encryptionContext(childId, id), key = createHmac("sha256", signingSecret()).update(context).digest(), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(context);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("SLMEDIA1"), iv, cipher.getAuthTag(), encrypted]);
}
export function decryptDemonstration(bytes: Uint8Array, childId: string, id: string) {
  const input = Buffer.from(bytes);
  if (input.length < 36 || input.length > DEMONSTRATION_MAX_BYTES + 36 || input.subarray(0, 8).toString("ascii") !== "SLMEDIA1") throw new Error("Invalid private recording envelope.");
  const context = encryptionContext(childId, id), key = createHmac("sha256", signingSecret()).update(context).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, input.subarray(8, 20)); decipher.setAAD(context); decipher.setAuthTag(input.subarray(20, 36));
  return Buffer.concat([decipher.update(input.subarray(36)), decipher.final()]);
}
function remote() {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || (process.env.CLOUDFLARE_R2_ACCOUNT_ID ? `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  const bucket = process.env.CLOUDFLARE_R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  return endpoint && bucket && accessKeyId && secretAccessKey ? { bucket, client: new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } }) } : null;
}
function localPath(childId: string, id: string) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.CODING_MEDIA_LOCAL !== "true") throw new Error("Private demonstration storage is unavailable. Keep your local recording; no upload was saved.");
  return join(process.cwd(), "artifacts", "coding-private-media", ownerScope(childId), `${id}.webm`);
}
/** Envelope screening only: browser decoding is a separately verified step.
 * No student file is evaluated as code or passed to a host media interpreter. */
export function validateWebmEnvelope(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 128 || buffer.length > DEMONSTRATION_MAX_BYTES || buffer.readUInt32BE(0) !== 0x1a45dfa3 || !buffer.subarray(0, 512).includes(Buffer.from("webm")) || !["V_VP8", "V_VP9", "V_AV1"].some(codec => buffer.subarray(0, 65536).includes(Buffer.from(codec)))) throw new Error("Use a bounded WebM video recording, not a renamed or empty file.");
  // The recorder requests video only. Refuse a declared audio track as well.
  if (["A_OPUS", "A_VORBIS"].some(codec => buffer.subarray(0, 65536).includes(Buffer.from(codec)))) throw new Error("Use a video-only demonstration without captured audio.");
  return { sha256: createHash("sha256").update(buffer).digest("hex"), size: buffer.length };
}
export function verifyDemonstrationReceipt(value: unknown, childId: string, activityId: string) {
  const attachment = demonstrationAttachmentSchema.parse(value);
  const parts = attachment.receipt.split("."); if (parts.length !== 2) throw new Error("The demonstration receipt is invalid.");
  const expected = createHmac("sha256", signingSecret()).update(parts[0]!).digest();
  const received = Buffer.from(parts[1]!, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("The demonstration receipt is invalid.");
  const signed = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
  if (signed.childId !== childId || signed.activityId !== activityId || JSON.stringify(signed.metadata) !== JSON.stringify(attachment.metadata)) throw new Error("This recording belongs to a different private workspace or source version.");
  return attachment;
}
export async function saveDemonstration(input: { childId: string; activityId: string; bytes: Uint8Array; transcript: string; rights: string; limitation: string; artifactHash: string; taskHash: string }): Promise<DemonstrationAttachment> {
  const screened = validateWebmEnvelope(input.bytes);
  const decoded = await verifyDecodedDemonstration(input.bytes, screened.sha256);
  const metadata = demonstrationMetadataSchema.parse({ ...screened, decoded, id: randomUUID(), mime: "video/webm", transcript: input.transcript, rights: input.rights, limitation: input.limitation, artifactHash: input.artifactHash, taskHash: input.taskHash, createdAt: new Date().toISOString() });
  const signed = Buffer.from(JSON.stringify({ childId: input.childId, activityId: input.activityId, metadata })).toString("base64url");
  const receipt = `${signed}.${createHmac("sha256", signingSecret()).update(signed).digest("base64url")}`;
  const storage = remote();
  const encrypted = encryptDemonstration(input.bytes, input.childId, metadata.id);
  // Never rely on an existing shared bucket's public-access configuration:
  // only authenticated app routes can decrypt these private project bytes.
  if (storage) await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: objectKey(input.childId, metadata.id), Body: encrypted, ContentType: "application/octet-stream", CacheControl: "private, no-store", IfNoneMatch: "*" }));
  else { const path = localPath(input.childId, metadata.id); await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, encrypted, { flag: "wx" }); }
  return { metadata, receipt };
}
export async function readDemonstration(childId: string, value: unknown, activityId: string) {
  const attachment = verifyDemonstrationReceipt(value, childId, activityId), storage = remote();
  let bytes: Uint8Array;
  if (storage) { const response = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: objectKey(childId, attachment.metadata.id) })); if (response.ContentLength && response.ContentLength > DEMONSTRATION_MAX_BYTES + 36) throw new Error("Demonstration size is invalid."); if (!response.Body) throw new Error("The private demonstration is unavailable."); bytes = await response.Body.transformToByteArray(); }
  else bytes = await readFile(localPath(childId, attachment.metadata.id));
  bytes = decryptDemonstration(bytes, childId, attachment.metadata.id);
  const observed = validateWebmEnvelope(bytes);
  if (observed.sha256 !== attachment.metadata.sha256 || observed.size !== attachment.metadata.size) throw new Error("The saved demonstration bytes no longer match their receipt.");
  return bytes;
}
