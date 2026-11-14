import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MAX_REQUEST_BYTES, authentic, requestProof, responseProof, sign, validateJob, type ExecutionLanguage } from "../../../../services/coding-runner/protocol.mjs";

export const executionResultSchema = z.object({
  jobId: z.string().uuid(), language: z.enum(["python", "javascript", "sql"]),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), isolationRuntime: z.enum(["runsc", "runc"]),
  stdout: z.string().max(32768), stderr: z.string().max(32768), exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(), status: z.enum(["completed", "runtime-error", "timeout", "output-limit", "infrastructure-error"]),
}).strict();

function configuration() {
  const raw = process.env.CODING_RUNNER_URL;
  const secret = process.env.CODING_RUNNER_SECRET;
  if (!raw || !secret || secret.length < 32) throw new Error("The isolated Coding execution service is not configured.");
  const url = new URL(raw);
  const gatewayPath = "/functions/v1/coding-execution";
  const path = url.pathname.replace(/\/$/, "");
  if (url.username || url.password || url.search || url.hash || (path !== "" && path !== gatewayPath)
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw new Error("Coding runner requires HTTPS, or a local loopback development connection.");
  }
  return { base: `${url.origin}${path}`, secret };
}

async function requestRunner(pathname: "/health" | "/execute", body: string, nonce: string, deadline: number) {
  const { base, secret } = configuration();
  const method = pathname === "/health" ? "GET" : "POST";
  const timestamp = Date.now().toString();
  const response = await fetch(`${base}${pathname}`, { method,
    headers: { "Content-Type": "application/json", "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": nonce,
      "X-Coding-Signature": sign(secret, requestProof(method, pathname, timestamp, nonce, body)) },
    body: method === "POST" ? body : undefined, signal: AbortSignal.timeout(deadline), redirect: "error", cache: "no-store",
  });
  const text = await response.text();
  if (text.length > 100_000 || !authentic(secret, responseProof(nonce, body, text), response.headers.get("x-coding-signature"))) throw new Error("Coding runner response failed verification.");
  if (!response.ok) throw new Error("Coding execution is unavailable or busy. Your saved work is safe.");
  return JSON.parse(text) as unknown;
}

export async function executeCodingSource(input: { language: ExecutionLanguage; source: string; stdin?: string; timeLimitMs?: number; expectedImageDigest?: string }) {
  const job = validateJob({ jobId: randomUUID(), language: input.language, source: input.source, stdin: input.stdin ?? "", timeLimitMs: input.timeLimitMs ?? 3000 });
  if (!job) throw new Error("The code execution request exceeds the permitted limits.");
  const body = JSON.stringify(job);
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new Error("The encoded execution request is too large.");
  const result = executionResultSchema.parse(await requestRunner("/execute", body, job.jobId, job.timeLimitMs + 38000));
  if (result.jobId !== job.jobId || result.language !== job.language) throw new Error("Coding runner returned a result for a different job.");
  if (input.expectedImageDigest && result.imageDigest !== input.expectedImageDigest) throw new Error("Coding runtime version does not match the reviewed lesson.");
  if (result.status === "infrastructure-error") throw new Error("The isolated runtime could not start. This is not a learner assessment failure.");
  return result;
}

export async function codingRunnerHealth() {
  return z.object({ available: z.boolean(), engines: z.object({ python: z.boolean(), javascript: z.boolean(), sql: z.boolean() }).strict() }).strict()
    .parse(await requestRunner("/health", "", randomUUID(), 6000));
}
