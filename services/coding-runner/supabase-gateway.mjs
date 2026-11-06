import { authentic, MAX_CLOCK_SKEW_MS, MAX_REQUEST_BYTES, requestProof } from "./protocol.mjs";

async function boundedText(stream, limit) {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Body limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// Transport only. Never evaluate source or give learner code Edge/database authority.
export function createSupabaseExecutionGateway({ runnerUrl, secret, fetchImpl = fetch, now = Date.now }) {
  const upstream = new URL(runnerUrl);
  if (upstream.protocol !== "https:" || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== "/" || !secret || secret.length < 32) {
    throw new Error("A private HTTPS runner and an independent signing secret are required.");
  }
  return async (request) => {
    const fail = (status) => new Response(JSON.stringify({ error: "Coding execution unavailable" }), {
      status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    const url = new URL(request.url);
    const prefix = "/functions/v1/coding-execution";
    const path = url.pathname.startsWith(`${prefix}/`) ? url.pathname.slice(prefix.length) : url.pathname;
    if (url.search || !((path === "/health" && request.method === "GET") || (path === "/execute" && request.method === "POST"))) return fail(404);
    const timestamp = request.headers.get("x-coding-timestamp") ?? "";
    const nonce = request.headers.get("x-coding-nonce") ?? "";
    if (!/^\d{13}$/.test(timestamp) || Math.abs(now() - Number(timestamp)) > MAX_CLOCK_SKEW_MS
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(nonce)) return fail(401);
    let body;
    try { body = await boundedText(request.body, MAX_REQUEST_BYTES); } catch { return fail(413); }
    if ((request.method === "GET" && body) || !authentic(secret, requestProof(request.method, path, timestamp, nonce, body), request.headers.get("x-coding-signature"))) return fail(401);
    try {
      const response = await fetchImpl(`${upstream.origin}${path}`, {
        method: request.method, headers: {
          "Content-Type": "application/json", "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": nonce,
          "X-Coding-Signature": request.headers.get("x-coding-signature"),
        }, body: request.method === "POST" ? body : undefined,
        redirect: "error", signal: AbortSignal.timeout(44000),
      });
      const result = await boundedText(response.body, 100000);
      return new Response(result, { status: response.status, headers: {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "X-Coding-Signature": response.headers.get("x-coding-signature") ?? "",
      } });
    } catch { return fail(503); }
  };
}
