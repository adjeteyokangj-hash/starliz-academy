import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithRefreshRetry } from "../src/lib/refresh_client";

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
    if (calls.filter((item) => item.includes("/api/account")).length === 1) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await fetchWithRefreshRetry("/api/account", {
      method: "GET",
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.equal(calls.filter((item) => item.includes("/api/account")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid_pin and pin_setup_required responses do not trigger session refresh retry", async () => {
  const originalFetch = globalThis.fetch;
  let accountCalls = 0;
  let refreshCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/refresh")) {
      refreshCalls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    accountCalls += 1;
    return new Response(JSON.stringify({ error: "Incorrect PIN.", code: "invalid_pin" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await fetchWithRefreshRetry("/api/account", { method: "GET" });
    assert.equal(response.status, 401);
    assert.equal(accountCalls, 1);
    assert.equal(refreshCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
