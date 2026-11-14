import test from "node:test";
import assert from "node:assert/strict";
import { requestCoachJson } from "../src/lib/coach/model-json";

test("explicit development QA mode makes no live model request and returns no fabricated review", async () => {
  const environment = { NODE_ENV: process.env.NODE_ENV, CODING_QA_DISABLE_LIVE_MODEL: process.env.CODING_QA_DISABLE_LIVE_MODEL }, original = globalThis.fetch;
  let requests = 0;
  try {
    Object.assign(process.env, { NODE_ENV: "development", CODING_QA_DISABLE_LIVE_MODEL: "true" });
    globalThis.fetch = async () => { requests++; throw new Error("No provider egress is permitted in this test."); };
    assert.equal(await requestCoachJson("synthetic-unit-value", "Synthetic approved fixture only", "No learner data"), null);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(environment)) { if (value === undefined) Reflect.deleteProperty(process.env, key); else Reflect.set(process.env, key, value); } }
});

test("the QA-only switch cannot alter production transport; this check uses only mocked HTTP", async () => {
  const environment = { NODE_ENV: process.env.NODE_ENV, CODING_QA_DISABLE_LIVE_MODEL: process.env.CODING_QA_DISABLE_LIVE_MODEL }, original = globalThis.fetch;
  let mockedRequests = 0;
  try {
    Object.assign(process.env, { NODE_ENV: "production", CODING_QA_DISABLE_LIVE_MODEL: "true" });
    globalThis.fetch = async () => { mockedRequests++; return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ message: "Synthetic mocked transport response only" }) } }] }), { status: 200 }); };
    assert.deepEqual(await requestCoachJson("synthetic-unit-value", "Synthetic fixture", "No learner data"), { message: "Synthetic mocked transport response only" });
    assert.equal(mockedRequests, 1);
  } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(environment)) { if (value === undefined) Reflect.deleteProperty(process.env, key); else Reflect.set(process.env, key, value); } }
});
