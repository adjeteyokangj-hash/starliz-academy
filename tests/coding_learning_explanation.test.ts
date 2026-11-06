import test from "node:test";
import assert from "node:assert/strict";
import { groundedExplanation } from "../src/lib/coding/learning/explanation-evidence";
import { safeTeachingMessage } from "../src/lib/coding/learning/teacher";
import { executeVisual } from "../src/lib/coding/learning/visual-machine";

test("generic concept words and Boolean values cannot stand in for an evidence-based explanation", () => {
  const activity = { year: 5, concepts: ["variable", "assignment"] };
  const run = executeVisual({ variables: { score: 3 }, handlers: { start: [{ op: "change", name: "score", value: 2 }] } }, {});
  assert.equal(groundedExplanation(activity, run, "I used a variable and an assignment because it works."), false);
  assert.equal(groundedExplanation(activity, run, "The variable assignment is true because it is correct."), false);
  assert.equal(groundedExplanation(activity, run, "The variable score became five because I added two to its old value."), true);
});
test("early readers can explain actual movement without technical coordinates", () => {
  const run = executeVisual({ variables: {}, handlers: { start: [{ op: "move", x: 1, y: 0 }] } }, {});
  assert.equal(groundedExplanation({ year: 1, concepts: ["command", "action"] }, run, "My arrow goes right."), true);
  assert.equal(groundedExplanation({ year: 1, concepts: ["command", "action"] }, run, "My arrow goes left."), false);
});
test("tutor text permits escaped coding examples but rejects private-detail requests and external contacts", () => {
  assert.equal(safeTeachingMessage("Use <h1> for the page's main heading. What words explain your fictional project?"), true);
  for (const message of ["What's your full name?", "Please provide your home address.", "Tell me your password.", "Send your API key so I can debug it.", "Visit example.com to continue.", "Email someone@outside.com.", "Visit h\u200bttps://outside.com."]) assert.equal(safeTeachingMessage(message), false, message);
  assert.equal(safeTeachingMessage("What is your variable name? Trace its value before the assignment."), true);
});
