import test from "node:test";
import assert from "node:assert/strict";
import { activityDefinition } from "../src/lib/coding/learning/catalogue";
import { initialActivityState, stageArtifact, transitionActivity } from "../src/lib/coding/learning/state-machine";
import { resolveTeachingKey, teachActivity } from "../src/lib/coding/learning/teacher";
import { guidedHref } from "../src/lib/coding/world/guided-mapping";
import type { ActivityContent, ActivityState } from "../src/lib/coding/learning/types";

const activity = activityDefinition("Y1.01");
assert.ok(activity);
const lesson = activity as ActivityContent;
const trace = "Follow one action or statement at a time. Compare the first place where the actual result differs from your plan.";

function restore(environment: Record<string, string | undefined>, fetchImpl: typeof fetch) {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
  }
  globalThis.fetch = fetchImpl;
}

test("a disabled model returns the curriculum fallback without a provider call", async () => {
  const environment = { NODE_ENV: process.env.NODE_ENV, CODING_QA_DISABLE_LIVE_MODEL: process.env.CODING_QA_DISABLE_LIVE_MODEL };
  const original = globalThis.fetch;
  let lookups = 0, requests = 0;
  try {
    Object.assign(process.env, { NODE_ENV: "development", CODING_QA_DISABLE_LIVE_MODEL: "true" });
    globalThis.fetch = async () => { requests++; throw new Error("No provider egress is permitted in this test."); };
    const started = Date.now();
    const turn = await teachActivity(lesson, initialActivityState(lesson), "discover", stageArtifact(lesson, initialActivityState(lesson), "discover"), undefined, "learner", async () => { lookups++; return "synthetic-key"; });
    assert.ok(Date.now() - started < 500);
    assert.equal(lookups, 0);
    assert.equal(requests, 0);
    assert.equal(turn.source, "fallback");
    assert.equal(turn.context, "curriculum");
    assert.match(turn.message, new RegExp(lesson.instruction.exampleReasoning[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(turn.message, new RegExp(trace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally { restore(environment, original); }
});

test("a stalled provider key does not hold the introduction", async () => {
  const started = Date.now();
  assert.equal(await resolveTeachingKey(() => new Promise<string>(() => {}), 40), null);
  assert.ok(Date.now() - started < 500);
});

test("an unavailable provider falls back without granting mastery or changing saved state", async () => {
  const environment = { NODE_ENV: process.env.NODE_ENV, CODING_QA_DISABLE_LIVE_MODEL: process.env.CODING_QA_DISABLE_LIVE_MODEL, CODING_AI_ZERO_DATA_RETENTION_VERIFIED: process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED };
  const original = globalThis.fetch;
  const state = initialActivityState(lesson);
  const saved = structuredClone(state);
  try {
    Object.assign(process.env, { NODE_ENV: "production", CODING_QA_DISABLE_LIVE_MODEL: "", CODING_AI_ZERO_DATA_RETENTION_VERIFIED: "" });
    globalThis.fetch = async () => { throw new Error("Synthetic provider unavailable"); };
    const started = Date.now();
    const transition = await transitionActivity(lesson, state, { action: "teach", stage: "discover", revision: "unit-only" }, {
      run: async () => { throw new Error("Introduction must not execute the learner program."); },
      teach: (definition, current, stage, artifact, question) => teachActivity(definition, current, stage, artifact, question, "learner", async () => "synthetic-key"),
      reflect: async () => { throw new Error("Introduction must not review mastery."); },
    });
    assert.ok(Date.now() - started < 1000);
    assert.equal(transition.newlyMastered, false);
    assert.equal(transition.state.mastered, false);
    assert.equal(transition.state.stage, "discover");
    assert.equal(transition.state.completed.length, 0);
    assert.equal(transition.state.tutorMessages.length, 1);
    assert.equal(transition.state.tutorMessages[0]?.source, "fallback");
    assert.equal(transition.state.tutorMessages[0]?.purpose, "instruction");
    assert.deepEqual(state, saved);
    assert.equal(guidedHref("activity", lesson.id), `/student/coding/world/activities/${lesson.id}`);
  } finally { restore(environment, original); }
});

test("a provider that never answers is abandoned by the existing transport limit", { timeout: 20000 }, async () => {
  const environment = { NODE_ENV: process.env.NODE_ENV, CODING_QA_DISABLE_LIVE_MODEL: process.env.CODING_QA_DISABLE_LIVE_MODEL };
  const original = globalThis.fetch;
  try {
    Object.assign(process.env, { NODE_ENV: "production", CODING_QA_DISABLE_LIVE_MODEL: "" });
    globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error("The teaching transport must be abortable.");
      signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")));
    });
    const started = Date.now();
    const turn = await teachActivity(lesson, initialActivityState(lesson), "discover", stageArtifact(lesson, initialActivityState(lesson), "discover"), undefined, "learner", async () => "synthetic-key");
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 15000, `introduction waited ${elapsed}ms`);
    assert.ok(elapsed >= 7000, `introduction returned before the transport limit: ${elapsed}ms`);
    assert.equal(turn.source, "fallback");
    assert.match(turn.message, /Point to the start and star|Follow one action/);
  } finally { restore(environment, original); }
});

test("a rejected introduction leaves the caller's activity state unchanged", async () => {
  const state: ActivityState = initialActivityState(lesson);
  const saved = structuredClone(state);
  await assert.rejects(() => transitionActivity(lesson, state, { action: "teach", stage: "discover", revision: "unit-only" }, {
    run: async () => { throw new Error("unused"); },
    teach: async () => { throw new Error("Synthetic tutor failure"); },
    reflect: async () => { throw new Error("unused"); },
  }), /Synthetic tutor failure/);
  assert.deepEqual(state, saved);
  assert.equal(state.mastered, false);
});
