import test from "node:test";
import assert from "node:assert/strict";
import { teachingContext } from "../src/lib/coding/learning/teacher";
import { personalisedTutorAllowed, redactTutorData, redactTutorText } from "../src/lib/coding/learning/tutor-privacy";
import { initialActivityState } from "../src/lib/coding/learning/state-machine";
import { firstRouteActivities } from "../src/lib/coding/learning/content/routes";
import { codingTeacherTurn } from "../src/lib/coding/model-tutor";
import { UNDERSTANDING_LOOPS } from "../src/lib/coding/catalog";
import { activityActionSchema } from "../src/lib/coding/learning/types";

test("project images are omitted before tutor context truncation so later textual evidence is retained", () => {
  const image = `data:image/png;base64,${"A".repeat(12000)}`;
  const context = redactTutorData({ html: `<img src="${image}" alt="Original bridge"><p>The fictional record supports the closing-time claim.</p>` }) as { html: string };
  assert.equal(context.html.includes(image), false);
  assert.ok(context.html.includes("[project image omitted]"));
  assert.ok(context.html.includes("The fictional record supports the closing-time claim."));
  assert.ok(context.html.length < 1000);
});

test("learner actions cannot override server age or tutor privacy scope", () => {
  const action = { action: "hint", stage: "build", revision: "privacy-contract" };
  assert.equal(activityActionSchema.safeParse(action).success, true);
  for (const override of [{ age: 18 }, { scope: "author" }, { learnerAge: 18 }, { zeroDataRetentionVerified: true }]) {
    assert.equal(activityActionSchema.safeParse({ ...action, ...override }).success, false);
  }
});

test("unverified provider privacy keeps all learner text, artifacts and execution out of model context", async () => {
  const previous = process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED;
  try {
    const activity = firstRouteActivities[0]!, state = initialActivityState(activity);
    state.lastExecution = { ok: false, output: { privateNote: "UNIQUE_LEARNER_OUTPUT" }, trace: [], stdout: "", stderr: "", error: "UNIQUE_LEARNER_ERROR", runtime: "test-contract", steps: 0 };
    const context = teachingContext(activity, state, "build", { type: "source", language: "python", source: "UNIQUE_LEARNER_CODE" }, "UNIQUE_LEARNER_QUESTION");
    assert.equal(personalisedTutorAllowed(), false);
    assert.equal(personalisedTutorAllowed({ kind: "learner", age: 12 }), false);
    assert.equal(personalisedTutorAllowed({ kind: "learner", age: null }), false);
    assert.equal(personalisedTutorAllowed({ kind: "learner", age: 13 }), true);
    assert.equal("artifact" in context, false); assert.equal("execution" in context, false); assert.equal("question" in context, false);
    assert.doesNotMatch(JSON.stringify(context), /UNIQUE_LEARNER/);
    let called = false;
    await codingTeacherTurn({ lesson: UNDERSTANDING_LOOPS, stage: "build", program: { blocks: [] }, hintCount: 3, run: null, yearGroup: "UNIQUE_PRIVATE_YEAR_GROUP" }, { getKey: async () => "unit-contract-only", request: async (_key, _system, raw) => {
      called = true; const payload = JSON.parse(raw);
      assert.equal(payload.program, undefined); assert.equal(payload.execution, undefined); assert.equal(payload.fallbackGuidance, undefined);
      assert.doesNotMatch(raw, /UNIQUE_PRIVATE_YEAR_GROUP/);
      return { message: "A repeat runs the actions inside it. Which action repeats?" };
    } });
    assert.equal(called, true, "Curriculum-only teaching still uses the real model transport contract");
  } finally { if (previous === undefined) delete process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED; else process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED = previous; }
});
test("permitted project context strips structured private fields, credentials and contact details", () => {
  const sanitized = redactTutorData({ profile: { nickname: "Fictional Fox", address: "PRIVATE_STREET", fullName: "PRIVATE_FULL_NAME", schoolName: "PRIVATE_SCHOOL" }, apiKey: "PRIVATE_KEY", source: 'password = "PRIVATE_PASSWORD"\nprint("fictional@example.com")' });
  const encoded = JSON.stringify(sanitized);
  assert.doesNotMatch(encoded, /PRIVATE_STREET|PRIVATE_FULL_NAME|PRIVATE_SCHOOL|PRIVATE_KEY|PRIVATE_PASSWORD|fictional@example.com/);
  assert.match(encoded, /Fictional Fox/);
  assert.doesNotMatch(redactTutorText("Call +44 7700 900123 or 07700 900123"), /7700|900123/);
});
