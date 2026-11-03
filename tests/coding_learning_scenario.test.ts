import test from "node:test";
import assert from "node:assert/strict";
import { executeScenario } from "../src/lib/coding/learning/scenario-engine";
import { groundedExplanation } from "../src/lib/coding/learning/explanation-evidence";

const base = { profile: { nickname: "Fox" }, audience: "private", deviceBindings: [], actions: [], chosenVersion: "v2", explanation: "A fictional practice profile.", story: [{ title: "Start", caption: "Move right", moves: ["right"] }] };
const result = (document: unknown, input: unknown = {}) => {
  const execution = executeScenario(document, input);
  assert.equal(execution.ok, true, execution.error);
  return execution.output as Record<string, unknown>;
};
test("requesting permission cannot impersonate a creator's permission grant", () => {
  const document = { ...base, actions: [{ action: "credit-creator", text: "Artwork by Rowan", target: "Rowan" }, { action: "request-permission", text: "May I reuse it?", target: "Rowan" }] };
  assert.equal(result(document, { permissionRequired: true, expectedCreator: "Rowan" }).creditValid, false);
  assert.equal(result(document, { permissionRequired: true, permissionGranted: true, expectedCreator: "Rowan" }).creditValid, true);
  assert.equal(result(document, { expectedCreator: "Another creator" }).creditValid, false);
});
test("restoring a version retrieves authoritative saved content instead of trusting a chosen-version label", () => {
  const versions = { v2: { profile: { nickname: "Owl" }, story: [{ title: "Saved", caption: "Move down", moves: ["down"] }] } };
  assert.equal(result(base, { versions }).restored, false);
  const restored = result({ ...base, actions: [{ action: "restore-version", text: "", target: "v2" }] }, { versions });
  assert.equal(restored.restored, true);
  assert.deepEqual(restored.profile, { nickname: "Owl" });
  assert.equal((restored.story as Array<{ caption: string }>)[0]!.caption, "Move down");
  assert.equal(result({ ...base, actions: [{ action: "restore-version", text: "", target: "v2" }] }).restored, false);
});
test("revisions change the rendered story and unknown profile fields fail privacy checks", () => {
  const revised = result({ ...base, actions: [{ action: "revise", text: "Walk one square right", target: "scene:0:caption" }] });
  assert.equal(revised.revisions, 1);
  assert.equal((revised.story as Array<{ caption: string }>)[0]!.caption, "Walk one square right");
  assert.equal(result({ ...base, profile: { nickname: "Fox", homeLocation: "My actual home" } }).privacySafe, false);
});

test("young learners can cite an actual fictional nickname or help decision without generic Boolean claims earning credit", () => {
  const profile = executeScenario(base, {});
  assert.equal(groundedExplanation({ year: 1, concepts: ["private", "profile"] }, profile, "I kept Fox because a nickname keeps the profile private."), true);
  assert.equal(groundedExplanation({ year: 1, concepts: ["private", "profile"] }, profile, "It is private because private is true."), false);
  const help = executeScenario({ ...base, profile: {}, actions: [{ action: "stop-contact", text: "", target: "" }, { action: "ask-adult", text: "", target: "" }] }, {});
  assert.equal(groundedExplanation({ year: 1, concepts: ["stop", "trusted adult"] }, help, "I stopped contact then asked an adult because I need help."), true);
});
test("feedback needs a useful suggestion and cannot conceal an earlier insult", () => {
  const feedback = (text: string) => ({ action: "give-feedback", text, target: "" });
  assert.equal(result({ ...base, actions: [feedback("The caption is small and difficult to read.")] }).actionableFeedback, false);
  assert.equal(result({ ...base, actions: [feedback("Try a larger caption because the words are hard to read.")] }).actionableFeedback, true);
  assert.equal(result({ ...base, actions: [feedback("Your picture is stupid."), feedback("Add a larger caption so the words are readable.")] }).respectfulFeedback, false);
});
