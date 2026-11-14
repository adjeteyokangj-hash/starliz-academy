import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authentic, requestProof, responseProof, sign } from "../../../../services/coding-runner/protocol.mjs";
import { DEMONSTRATION_MAX_BYTES } from "./demonstration-contract";
const resultSchema = z.object({ jobId: z.string().uuid(), status: z.literal("valid"), imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), isolationRuntime: z.literal("runsc"), details: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().min(128).max(DEMONSTRATION_MAX_BYTES), width: z.number().int().min(16).max(1920), height: z.number().int().min(16).max(1080), frames: z.number().int().min(2), durationMs: z.number().min(100).max(46000), decoded: z.literal(true) }).strict() }).strict();
export async function verifyDecodedDemonstration(bytes: Uint8Array, sha256: string) {
  const raw = process.env.CODING_MEDIA_RUNNER_URL, secret = process.env.CODING_RUNNER_SECRET, expectedImage = process.env.CODING_RUNNER_MEDIA_IMAGE;
  if (!raw || !secret || secret.length < 32 || !expectedImage || !/^sha256:[a-f0-9]{64}$/.test(expectedImage)) throw new Error("The isolated private-video decoder is not configured. Keep the local clip; it has not been accepted as verified evidence.");
  const base = new URL(raw);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" || base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new Error("Use a reviewed HTTPS media runner or a local loopback connection.");
  const nonce = randomUUID(), timestamp = String(Date.now()), path = "/validate-media";
  const response = await fetch(`${base.origin}${path}`, { method: "POST", headers: { "Content-Type": "video/webm", "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": nonce, "X-Coding-Signature": sign(secret, requestProof("POST", path, timestamp, nonce, bytes)) }, body: Buffer.from(bytes), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35000) });
  const text = await response.text();
  if (text.length > 16384 || !authentic(secret, responseProof(nonce, bytes, text), response.headers.get("x-coding-signature"))) throw new Error("The private recording decoder response failed verification.");
  if (!response.ok) throw new Error(response.status === 422 ? "The recording did not decode as a complete bounded video. Keep the local copy and record again." : "The isolated recording decoder is unavailable. Keep the local copy and retry later.");
  const result = resultSchema.parse(JSON.parse(text));
  if (result.jobId !== nonce || result.imageDigest !== expectedImage || result.details.sha256 !== sha256 || result.details.size !== bytes.byteLength) throw new Error("The actual decoder evidence does not match this recording or the reviewed image.");
  return { imageDigest: result.imageDigest, frames: result.details.frames, width: result.details.width, height: result.details.height, durationMs: result.details.durationMs };
}
