import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_REQUEST_BYTES = 96 * 1024;
export const MAX_OUTPUT_BYTES = 32 * 1024;
export const MAX_CLOCK_SKEW_MS = 30_000;
export const languages = Object.freeze(["python", "javascript", "sql"]);

export function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sign(secret, text) {
  return createHmac("sha256", secret).update(text).digest("hex");
}

export function authentic(secret, text, signature) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(sign(secret, text), "hex"), Buffer.from(signature, "hex"));
}

export function requestProof(method, pathname, timestamp, nonce, body) {
  return `${method}\n${pathname}\n${timestamp}\n${nonce}\n${digest(body)}`;
}

export function responseProof(nonce, requestBody, responseBody) {
  return `${nonce}\n${digest(requestBody)}\n${digest(responseBody)}`;
}

export function validateJob(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "jobId,language,source,stdin,timeLimitMs") return null;
  if (typeof value.jobId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.jobId)) return null;
  if (!languages.includes(value.language)) return null;
  if (typeof value.source !== "string" || !value.source.trim() || Buffer.byteLength(value.source) > 64 * 1024) return null;
  if (typeof value.stdin !== "string" || Buffer.byteLength(value.stdin) > 8 * 1024) return null;
  if (!Number.isInteger(value.timeLimitMs) || value.timeLimitMs < 250 || value.timeLimitMs > 5000) return null;
  return { jobId: value.jobId, language: value.language, source: value.source, stdin: value.stdin, timeLimitMs: value.timeLimitMs };
}

export function pinnedImage(value) {
  return typeof value === "string" && /^(?:[a-z0-9][a-z0-9./:_-]*@)?sha256:[a-f0-9]{64}$/.test(value) ? value : null;
}

export function imageDigest(image) { return image.includes("@") ? image.split("@")[1] : image; }
