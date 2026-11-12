import test from "node:test";
import assert from "node:assert/strict";
import { initialWorld, locations, missions, runMission, transitionWorld, parseCommands, worldActionSchema } from "../src/lib/coding/world/model";
import type { VisualCommand } from "../src/lib/coding/learning/visual-machine";
const routine = (id: string): VisualCommand[] => locations.find(l => l.id === id)!.cycle.map(name => ({ op: "emit", name }));
for (const location of locations) {
  test(`${location.id}: ordered simulation, loops and both conditional fixtures`, () => {
    const body = routine(location.id);
    assert.equal(runMission(`${location.id}-sequence`, body).ok, true);
    assert.equal(runMission(`${location.id}-sequence`, [...body].reverse()).ok, false);
    assert.equal(runMission(`${location.id}-loop`, [{ op: "repeat", amount: 3, body }]).ok, true);
    assert.equal(runMission(`${location.id}-loop`, body).ok, false);
    const conditional: VisualCommand[] = [{ op: "if", test: { read: "needsHelp" }, body: [{ op: "emit", name: "assist" }], otherwise: [{ op: "emit", name: "ready" }] }, { op: "repeat", amount: 2, body }];
    assert.equal(runMission(`${location.id}-decision`, conditional).ok, true);
    assert.equal(runMission(`${location.id}-decision`, [{ op: "emit", name: "assist" }, { op: "repeat", amount: 2, body }]).ok, false);
  });
}
test("advanced practice is gated, all locations remain explorable, formal evidence is absent", () => {
  const initial = initialWorld();
  assert.throws(() => transitionWorld(initial, { type: "run", missionId: "pizza-loop", commands: [] }));
  const passed = transitionWorld(initial, { type: "run", missionId: "pizza-sequence", commands: routine("pizza") });
  assert.deepEqual(initial.completed, []);
  assert.deepEqual(passed.state.completed, ["pizza-sequence"]);
  assert.equal(passed.state.revision, 1);
  assert.equal("skillStatus" in passed.state, false);
  const repeated = transitionWorld(passed.state, { type: "run", missionId: "pizza-sequence", commands: routine("pizza") });
  assert.equal(repeated.state.completed.length, 1);
  assert.equal(missions.filter(mission => mission.chapter < 5).length, 21);
});
test("hints and saved programs do not grant practice completion", () => {
  const result = transitionWorld(initialWorld(), { type: "hint", missionId: "pizza-sequence", commands: [] });
  assert.equal(result.state.hints["pizza-sequence"], 1);
  assert.equal(result.state.completed.length, 0);
  assert.ok(result.hint);
});
test("hostile or deeply nested programs are rejected before recursive validation", () => {
  assert.throws(() => parseCommands([{ op: "eval", value: "process.env" }]));
  let nested: unknown = [];
  for (let i = 0; i < 50; i++) nested = [{ op: "repeat", amount: 1, body: nested }];
  assert.throws(() => parseCommands(nested));
  assert.equal(worldActionSchema.safeParse({ type: "run", missionId: "pizza-sequence", commands: [], completed: ["pizza-sequence"] }).success, false);
});
test("unbounded loops and recursive event calls stop within the shared runtime budget", () => {
  assert.equal(runMission("pizza-sequence", [{ op: "until", test: false, body: [] }]).ok, false);
  assert.equal(runMission("pizza-sequence", [{ op: "emit", name: "start" }]).ok, false);
});

test("cross-location inventions require both location prerequisites and execute a combined routine", () => {
  const mission = missions.find(m => m.id === "robot-farm-invention")!;
  const commands: VisualCommand[] = [{ op: "repeat", amount: 2, body: mission.actions!.map(name => ({ op: "emit", name })) }];
  assert.throws(() => transitionWorld(initialWorld(), { type: "run", missionId: mission.id, commands }));
  const ready = initialWorld(); ready.completed = ["robot-loop", "farm-loop"];
  assert.equal(transitionWorld(ready, { type: "run", missionId: mission.id, commands }).run?.ok, true);
});
test("practice objectives and hints withhold the assessed action sequence", () => {
  const revealed = (text: string, names: readonly string[]) => names.length > 1 && names.every(name => new RegExp(`\\b${name}\\b`).test(text)) && names.some((name, index) => index > 0 && text.indexOf(names[index - 1]!) < text.indexOf(name) && text.indexOf(name) - text.indexOf(names[index - 1]!) < 40);
  for (const mission of missions) {
    const location = locations.find(place => place.id === mission.location)!;
    assert.equal(revealed(mission.objective, mission.actions ?? location.cycle), false, mission.id);
    assert.equal(mission.objective.includes("emit assist"), false, mission.id);
  }
  const farm = missions.find(mission => mission.id === "farm-sequence")!;
  assert.equal(farm.objective.includes("plant"), false);
  let state = initialWorld();
  for (let step = 0; step < 3; step++) {
    const hinted = transitionWorld(state, { type: "hint", missionId: "farm-sequence", commands: [] });
    assert.equal(/plant|water|grow|harvest/.test(hinted.hint ?? ""), false);
    state = hinted.state;
  }
  assert.match(transitionWorld(initialWorld(), { type: "hint", missionId: "farm-sequence", commands: [] }).hint ?? "", /mission board/i);
  assert.equal(runMission("farm-sequence", []).feedback.includes("plant"), true);
  assert.equal(runMission("farm-sequence", routine("farm")).ok, true);
  const practised = transitionWorld(initialWorld(), { type: "run", missionId: "farm-sequence", commands: routine("farm") });
  assert.equal(practised.state.completed.includes("farm-sequence"), true);
  assert.equal("skillStatus" in practised.state, false);
  const ready = initialWorld(); ready.completed = ["pizza-sequence", "pizza-loop"];
  let decisionState = ready;
  let decisionHint = "";
  for (let step = 0; step < 3; step++) {
    const hinted = transitionWorld(decisionState, { type: "hint", missionId: "pizza-decision", commands: [] });
    decisionState = hinted.state;
    decisionHint = hinted.hint ?? "";
  }
  assert.equal(decisionHint.includes("emit assist"), false);
});
test("cosmetic unlocks cannot be forged by a preferences request", () => {
  const state = initialWorld();
  assert.throws(() => transitionWorld(state, { type: "preferences", location: state.location, avatar: "🧑‍🍳", companion: state.companion, decoration: "🌈", reducedMotion: false, highContrast: false }));
});
