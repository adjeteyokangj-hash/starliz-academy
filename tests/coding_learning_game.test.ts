import test from "node:test";
import assert from "node:assert/strict";
import { executeLearningGame } from "../src/lib/coding/learning/game-engine";

const game = { title: "Fictional learning game", learningGoal: "Count one point for each correct practice choice", instructions: "Choose the answer, inspect your score and restart for another play.", audience: "private", fontSize: 24, testNotes: "Test both answer buttons and restart.",
  controls: [{ id: "answer", label: "Check answer", event: "answer", value: 1, keyboard: true }, { id: "restart", label: "Restart game", event: "restart", value: 0, keyboard: true }],
  program: { variables: { score: 0 }, handlers: { start: [{ op: "set", name: "score", value: 0 }], answer: [{ op: "change", name: "score", value: { read: "event" } }], restart: [] } } };
const output = (run: ReturnType<typeof executeLearningGame>) => run.output as Record<string, unknown>;
test("declared game buttons execute the actual visual program and restart resets state", () => {
  const run = executeLearningGame(game, { events: [{ type: "click", target: "answer" }, { type: "click", target: "answer" }] });
  assert.equal(run.ok, true, run.error); assert.deepEqual(output(run).variables, { score: 2 });
  const restart = executeLearningGame(game, { events: [{ type: "click", target: "answer" }, { type: "click", target: "restart" }] });
  assert.equal(restart.ok, true, restart.error); assert.deepEqual(output(restart).variables, { score: 0 });
});
test("game execution rejects undeclared controls and disconnected handlers", () => {
  assert.equal(executeLearningGame(game, { events: [{ type: "click", target: "unknown" }] }).ok, false);
  assert.equal(executeLearningGame({ ...game, controls: [{ ...game.controls[0], event: "missing" }] }, {}).ok, false);
  assert.equal(executeLearningGame({ ...game, controls: [game.controls[0], game.controls[0]] }, {}).ok, false);
});
test("game accessibility and sharing results reflect actual settings", () => {
  const inaccessible = executeLearningGame({ ...game, audience: "public", fontSize: 12, controls: [{ ...game.controls[0], keyboard: false }] }, {});
  assert.equal(inaccessible.ok, true); assert.equal(output(inaccessible).controlsAccessible, false); assert.equal(output(inaccessible).readable, false); assert.equal(output(inaccessible).privacySafe, false);
  const repaired = executeLearningGame(game, {});
  assert.equal(output(repaired).controlsAccessible, true); assert.equal(output(repaired).readable, true); assert.equal(output(repaired).privacySafe, true);
});
