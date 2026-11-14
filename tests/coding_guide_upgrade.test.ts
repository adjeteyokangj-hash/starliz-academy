import test from "node:test";
import assert from "node:assert/strict";
import { lessonGuide } from "../src/components/guidance/coding-guides";
import { advance } from "../src/components/guidance/guide";
import { codingFeedback, mistakeHint } from "../src/components/coding/coding-guide-outcomes";

test("MG classifies observed errors without copying answers or internal details", () => {
  assert.match(mistakeHint({ kind: "run", passed: false, error: "SyntaxError: secret", moved: false }), /punctuation/);
  const hint = mistakeHint({ kind: "run", passed: false, error: "Stopped early. Expected bake.", moved: true });
  assert.match(hint, /last action/);
  assert.doesNotMatch(hint, /bake/);
  assert.match(mistakeHint({ kind: "run", passed: false, error: "runner unavailable" }), /available/);
});

test("PP uses the lesson objective and waits for an edit, run and save", () => {
  const context = { stage: "build", editor: "python", objective: "Compare two scores.", completed: false } as const;
  const steps = lessonGuide(context);
  const plan = steps.find(step => step.id === "plan")!;
  assert.match(plan.text, /Compare two scores/);
  assert.equal(advance(steps, plan, "run"), plan);
  const edit = steps.find(step => step.id === "edit")!;
  assert.equal(advance(steps, edit, "run"), edit);
  const improve = steps.find(step => step.id === "improve")!;
  assert.equal(advance(steps, improve, "edit")?.id, "run");
  const save = steps.find(step => step.id === "save")!;
  assert.equal(advance(steps, save, "check"), save);
  assert.ok(!lessonGuide(context, true).some(step => step.id === "plan"));
  assert.ok(!lessonGuide({ ...context, stage: "create" }).some(step => step.id === "plan"));
});

test("EN celebrates first success and correction, and confirms the actual save location", () => {
  const initial = { succeeded: false, failed: false };
  const first = codingFeedback(initial, { kind: "run", passed: true });
  assert.equal(first.celebrate, true);
  assert.equal(codingFeedback(first.history, { kind: "run", passed: true }).celebrate, false);
  const failure = codingFeedback(first.history, { kind: "run", passed: false });
  assert.match(codingFeedback(failure.history, { kind: "run", passed: true }).message, /improved/);
  assert.match(codingFeedback(first.history, { kind: "save", location: "world" }).message, /Inventions & Skills/);
  assert.match(codingFeedback(first.history, { kind: "save", location: "lesson" }).message, /Reopen this lesson/);
});

test("MG asks the learner to compare observations when evidence is inconclusive", () => {
  const base = { kind: "run", passed: false } as const;
  assert.match(mistakeHint(base), /Which action would you check first\?/);
  const hint = mistakeHint({ ...base, error: "opaque diagnostic: private value", moved: true });
  assert.match(hint, /What did you expect it to do next\?/);
  assert.doesNotMatch(hint, /opaque|private value/);
});
