import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithRefreshRetry } from "../src/lib/refresh_client";

test("fetchWithRefreshRetry returns first response when not 401", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await fetchWithRefreshRetry("/api/student/example", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ value: 1 }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "/api/student/example");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRefreshRetry refreshes and retries once after 401", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({ ok: true, refreshed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await fetchWithRefreshRetry("/api/student/example", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ value: 1 }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 3);
    assert.equal(calls[0]?.input, "/api/student/example");
    assert.equal(calls[1]?.input, "/api/auth/refresh");
    assert.equal(calls[2]?.input, "/api/student/example");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
