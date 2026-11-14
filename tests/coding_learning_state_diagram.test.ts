import test from "node:test";
import assert from "node:assert/strict";
import { stateDiagramSchema } from "../src/lib/coding/learning/state-diagram-contract";
import { modeDiagram } from "../src/lib/coding/learning/content/model-control-tools";

test("instruction diagrams require bounded deterministic transitions between declared states", () => {
  const diagram = modeDiagram(0);
  assert.equal(stateDiagramSchema.safeParse(diagram).success, true);
  assert.equal(stateDiagramSchema.safeParse({ ...diagram, states: [...diagram.states, diagram.states[0]] }).success, false);
  assert.equal(stateDiagramSchema.safeParse({ ...diagram, initial: "missing" }).success, false);
  assert.equal(stateDiagramSchema.safeParse({ ...diagram, transitions: [{ ...diagram.transitions[0], to: "missing" }] }).success, false);
  assert.equal(stateDiagramSchema.safeParse({ ...diagram, transitions: [...diagram.transitions, { ...diagram.transitions[0], to: "paused" }] }).success, false, "A state/signal pair cannot declare two different next states");
});
