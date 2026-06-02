import test from "node:test";
import assert from "node:assert/strict";
import { persistParentActiveChild } from "../src/lib/parent-active-child-client";

test("persistParentActiveChild posts the selected child id to the active child endpoint", async () => {
  const calls: Array<{ input: string; init: { body: string; credentials: string; method: string } }> = [];

  const ok = await persistParentActiveChild("child-123", async (input, init) => {
    calls.push({ input, init });
    return { ok: true };
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/children/active");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), { childId: "child-123" });
});

test("persistParentActiveChild returns false when the active child switch fails", async () => {
  const ok = await persistParentActiveChild("child-456", async () => ({ ok: false }));

  assert.equal(ok, false);
});
