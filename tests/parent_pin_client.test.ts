import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithRefreshRetry } from "../src/lib/refresh_client";
import { postParentPinVerify } from "../src/lib/parent-pin-client";

test("fetchWithRefreshRetry still retries after 401 if abort fires during refresh", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/auth/refresh")) {
      controller.abort();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (calls.filter((item) => item.includes("/api/pin/verify")).length === 1) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await fetchWithRefreshRetry("/api/pin/verify", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ pin: "1234" }),
    });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((item) => item.includes("/api/pin/verify")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postParentPinVerify retries once after a dropped network request", async () => {
  const originalFetch = globalThis.fetch;
  let verifyCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/refresh")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    verifyCalls += 1;
    if (verifyCalls === 1) {
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await postParentPinVerify("1234");
    assert.equal(response.status, 200);
    assert.equal(verifyCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
