import test from "node:test";
import assert from "node:assert/strict";
import { executeVisual } from "../src/lib/coding/learning/visual-machine";
import { executeVisualWorkspace } from "../src/lib/coding/learning/visual-workspace";
import type { Json } from "../src/lib/coding/learning/types";
import { executeSystems, systemsDocumentSchema } from "../src/lib/coding/learning/systems-engine";
import { executeClassifier, executeData, executeMedia, classifierDocumentSchema, dataDocumentSchema, mediaDocumentSchema } from "../src/lib/coding/learning/studio-engines";
import { atPath, checkExecution } from "../src/lib/coding/learning/checks";

const value = (output: unknown) => output as Record<string, unknown>;
test("saved-file assertions resolve literal filenames without accepting a forged nested object", () => {
  const files: Json = { files: { "toolkit.txt": "real file", toolkit: { txt: "different nested data" }, "a/b~c": "escaped key" } };
  assert.equal(atPath(files, "/files/toolkit.txt"), "real file");
  assert.equal(atPath(files, "files.toolkit.txt"), "different nested data");
  assert.equal(atPath(files, "/files/a~1b~0c"), "escaped key");
  assert.equal(atPath(files, "/files/a~2b"), undefined);
  assert.equal(atPath(files, "/__proto__/polluted"), undefined);
  assert.equal(atPath({ files: { toolkit: { txt: "forged" } } }, "/files/toolkit.txt"), undefined);
});

test("broadcasts coordinate actual character receivers once, preserve payloads and reset cleanly", () => {
  const scene: Json = { actors: {
    sender: { origin: { x: 1, y: 1 }, program: { variables: {}, handlers: { start: [], launch: [{ op: "broadcast", name: "parcel", value: 2 }] } } },
    receiver: { origin: { x: 3, y: 1 }, program: { variables: { count: 0 }, handlers: { start: [], parcel: [{ op: "change", name: "count", value: { read: "event" } }, { op: "move", x: 0, y: 1 }] } } },
    bystander: { origin: { x: 5, y: 1 }, program: { variables: {}, handlers: { start: [], unrelated: [{ op: "move", x: 1, y: 0 }] } } },
  } };
  const run = executeVisualWorkspace(scene, { width: 8, height: 8, events: [{ name: "launch", value: 0 }] });
  assert.equal(run.ok, true, run.error); assert.equal(value(run.output).broadcastCount, 1);
  const actors = value(value(run.output).actors);
  assert.deepEqual(value(actors.receiver).variables, { count: 2 }); assert.equal(value(actors.receiver).y, 2);
  assert.deepEqual(value(actors.bystander).visits, [{ x: 5, y: 1 }]);
  const reset = executeVisualWorkspace(scene, { width: 8, height: 8, events: ["launch", "restart", "launch"].map((name) => ({ name, value: 0 })) });
  assert.equal(reset.ok, true, reset.error); assert.equal(value(reset.output).broadcastCount, 2);
  assert.deepEqual(value(value(value(reset.output).actors).receiver).variables, { count: 2 }, "Restart removes the old receiver state before the next delivered message");
  const cycle: Json = { actors: { looping: { origin: { x: 0, y: 0 }, program: { variables: {}, handlers: { start: [{ op: "broadcast", name: "again" }], again: [{ op: "broadcast", name: "again" }] } } } } };
  const blocked = executeVisualWorkspace(cycle, {});
  assert.equal(blocked.ok, false); assert.match(blocked.error!, /64 broadcast|message cycle/);
});

test("pictogram validity matches the renderer's supported whole-observation counts", () => {
  const base = { question: "Count fictional observations", rows: [], operations: [], chart: { type: "pictogram", title: "Counted observations", category: "category", value: "count", startAtZero: true }, conclusion: "", source: "Synthetic data", licence: "original", credit: "", alternatives: "One circle is one observation", fontSize: 20, representation: { mode: "none", values: [], text: "", bits: 8 } };
  for (const [count, expected] of [[0, true], [200, true], [201, false], [-1, false], [0.5, false]] as const) {
    const run = executeData({ ...base, rows: [{ category: "fictional", count }] }, {});
    assert.equal(run.ok, true); assert.equal(value(run.output).chartDataValid, expected); assert.equal(value(run.output).chartAccessible, expected);
  }
});
test("visual events, procedures, branching and restart execute rather than accepting declared success", () => {
  const document = { variables: { score: 0 }, handlers: { start: [{ op: "move", x: 1, y: 0 }], hit: [{ op: "change", name: "score", value: 1 }], dance: [{ op: "call", name: "twice", arguments: [2] }] },
    procedures: { twice: { parameters: ["count"], body: [{ op: "repeat", amount: { read: "count" }, body: [{ op: "move", x: 0, y: 1 }] }] } } };
  const run = executeVisual(document, { events: [{ name: "start" }, { name: "hit" }, { name: "dance" }] });
  assert.equal(run.ok, true);
  assert.equal(value(run.output).x, 1); assert.equal(value(run.output).y, 2);
  assert.deepEqual(value(run.output).variables, { score: 1 });
  const replay = executeVisual(document, { events: [{ name: "hit" }, { name: "restart" }] });
  assert.deepEqual(value(replay.output).variables, { score: 0 }); assert.equal(value(replay.output).x, 1);
});
test("visual runaway loops and malformed operations cannot produce passing outcomes", () => {
  const infinite = executeVisual({ variables: {}, handlers: { start: [{ op: "until", test: false, body: [] }] } }, {});
  assert.equal(infinite.ok, false); assert.match(infinite.error!, /500/);
  const invalid = executeVisual({ variables: {}, handlers: { start: [{ op: "eval", value: "process.exit()" }] } }, {});
  assert.equal(invalid.ok, false);
  assert.equal(checkExecution(invalid, [{ path: "$", equals: null, description: "Cannot pass by matching a failed run's null output" }])[0]!.passed, false);
  for (const calculation of [{ calculate: "not", arguments: [true, false] }, { calculate: "add", arguments: [1] }]) {
    assert.equal(executeVisual({ variables: {}, handlers: { start: [{ op: "set", name: "result", value: calculation }] } }, {}).ok, false, "A calculation cannot silently ignore an extra input or accept a missing one");
  }
  const overflow = executeVisual({ variables: {}, handlers: { start: [{ op: "set", name: "result", value: { calculate: "multiply", arguments: [1000000, 1000000] } }] } }, {});
  assert.equal(overflow.ok, false); assert.match(overflow.error!, /visual calculations/);
});
test("robot sensor feedback changes real state and rejects unsafe actuator power", () => {
  const control = { variables: {}, handlers: { start: [{ op: "repeat", amount: 30, body: [{ op: "motor", amount: { read: "sensor.error" } }] }, { op: "stop" }] } };
  const run = executeVisual(control, { target: 4 });
  assert.equal(run.ok, true); assert.ok(Number(value(run.output).x) > 3.8); assert.equal(value(run.output).stopped, true);
  const unsafe = executeVisual({ variables: {}, handlers: { start: [{ op: "motor", amount: 20 }] } }, {});
  assert.equal(unsafe.ok, false);
});

test("robot motors follow heading, cannot jump through obstacles and measure fractional distance", () => {
  const document = { variables: { measured: 0 }, handlers: { start: [{ op: "set", name: "measured", value: { read: "sensor.distance" } }, { op: "motor", amount: 2 }, { op: "stop" }] } };
  const down = executeVisual(document, { start: { x: 2, y: 2 }, heading: 1, dt: 0.5, obstacles: [{ x: 2, y: 0 }] });
  assert.equal(down.ok, true); assert.equal(value(down.output).x, 2); assert.equal(value(down.output).y, 1);
  assert.deepEqual(value(down.output).variables, { measured: 2 }); assert.deepEqual(value(down.output).powers, [2, 0]);
  const fractional = executeVisual(document, { start: { x: 1.5, y: 1 }, dt: 0.25, obstacles: [{ x: 3, y: 1 }] });
  assert.equal(fractional.ok, true); assert.deepEqual(value(fractional.output).variables, { measured: 1.5 });
  const crossing = executeVisual({ variables: {}, handlers: { start: [{ op: "motor", amount: 4 }, { op: "stop" }] } }, { start: { x: 1, y: 1 }, width: 8, dt: 1, obstacles: [{ x: 3, y: 1 }] });
  assert.equal(crossing.ok, true); assert.equal(value(crossing.output).x, 1); assert.equal(value(crossing.output).collision, true); assert.deepEqual(value(crossing.output).powers, [0, 0]);
  const outside = executeVisual(document, { start: { x: 0, y: 1 }, heading: 2, dt: 1 });
  assert.equal(outside.ok, false); assert.match(outside.error!, /left the map/);
});

test("line sensors guide actual turns and movement to a supplied destination", () => {
  const forward = { op: "forward", amount: 1 };
  const controller = { op: "if", test: { read: "sensor.lineAhead" }, body: [forward], otherwise: [{ op: "if", test: { read: "sensor.lineLeft" }, body: [{ op: "turn", amount: -1 }, forward], otherwise: [{ op: "turn", amount: 1 }, forward] }] };
  const track = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }];
  const run = executeVisual({ variables: {}, handlers: { start: [{ op: "until", test: { read: "sensor.destination" }, body: [controller] }, { op: "stop" }] } }, { start: track[0], track, destination: track.at(-1), width: 6, height: 6 });
  assert.equal(run.ok, true, run.error); assert.deepEqual(value(run.output).visits, track); assert.equal(value(run.output).stopped, true);
});

const computer = systemsDocumentSchema.parse({ mode: "computer", bits: 4, left: 9, right: 8,
  program: [{ op: "LOAD", operand: 0 }, { op: "ADD", operand: 1 }, { op: "STORE", operand: 2 }, { op: "OUT", operand: 0 }, { op: "HALT", operand: 0 }],
  memory: [9, 8, ...Array(14).fill(0)], gates: [], outputGate: "", components: [], explanation: "A bounded model with a four-bit accumulator." });
test("stored instructions, carry and overflow are computed from memory", () => {
  const run = executeSystems(computer);
  assert.equal(run.ok, true); assert.equal(value(run.output).accumulator, 1); assert.equal(value(run.output).overflow, true);
  assert.deepEqual(value(run.output).output, [1]);
  assert.deepEqual(value(run.output).trace, run.trace);
  assert.equal(atPath(run.output, "trace.2.memory.2"), 1);
  assert.equal(atPath(run.output, "trace.2.instruction"), "STORE");
  const changed = executeSystems(computer, { memory: [2, 3, ...Array(14).fill(0)] });
  assert.equal(value(changed.output).accumulator, 5);
});
test("reconvergent circuits cannot multiply recursive work exponentially", () => {
  const gates: Array<{ id: string; op: "INPUT" | "AND"; inputs: string[] }> = ["A", "B", "C", "D"].map((id) => ({ id, op: "INPUT", inputs: [] }));
  for (let index = 0; index < 26; index++) { const previous = index ? `g${index - 1}` : "A"; gates.push({ id: `g${index}`, op: "AND", inputs: [previous, previous] }); }
  const result = executeSystems({ ...computer, mode: "circuit", gates, outputGate: "g25" });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual((value(result.output).truthTable as Array<{ output: boolean }>).map((row) => row.output), Array.from({ length: 16 }, (_, index) => Boolean(index & 1)), "Cached values must be recomputed for each truth row");
  assert.ok(Number(value(result.output).gateEvaluations) <= 1024, "Shared wiring is evaluated within the server's explicit work budget");
});
test("a wired logic circuit evaluates all truth rows and rejects feedback cycles", () => {
  const circuit = { ...computer, mode: "circuit", gates: [{ id: "A", op: "INPUT", inputs: [] }, { id: "B", op: "INPUT", inputs: [] }, { id: "gate", op: "AND", inputs: ["A", "B"] }], outputGate: "gate" };
  const result = executeSystems(circuit);
  assert.equal(result.ok, true);
  assert.deepEqual((value(result.output).truthTable as Array<{ output: boolean }>).map((row) => row.output), [false, false, false, true]);
  assert.equal(executeSystems({ ...circuit, gates: [...circuit.gates.slice(0, 2), { id: "gate", op: "NOT", inputs: ["gate"] }] }).ok, false);
});

const dataset = dataDocumentSchema.parse({ dataSource: "fixture", question: "Which category occurs most often?", rows: [], operations: [{ op: "group", field: "travel" }], chart: { type: "bar", title: "Travel choices", category: "category", value: "count", startAtZero: true }, conclusion: "Compare the counts before making a claim.", source: "Synthetic classroom responses", licence: "original", credit: "", alternatives: "Each bar has its count in text.", fontSize: 20, representation: { mode: "none", values: [], text: "", bits: 8 } });
test("data transformations use supplied observations and recalculate on changed input", () => {
  const first = executeData(dataset, { rows: [{ travel: "walk" }, { travel: "cycle" }, { travel: "walk" }] });
  const second = executeData(dataset, { rows: [{ travel: "cycle" }, { travel: "cycle" }] });
  assert.deepEqual(value(first.output).summaries, { groups: [{ category: "walk", count: 2 }, { category: "cycle", count: 1 }] });
  assert.deepEqual(value(second.output).summaries, { groups: [{ category: "cycle", count: 2 }] });
});
test("spreadsheet formulas evaluate bounded ranges and reject executable text", () => {
  const sheet = { ...dataset, dataSource: "document", rows: [{ amount: 3 }, { amount: 7 }], operations: [{ op: "formula", expression: "SUM(A1:A2)", output: "total" }] };
  assert.deepEqual(value(executeData(sheet).output).summaries, { total: 10 });
  assert.equal(executeData({ ...sheet, operations: [{ op: "formula", expression: "process.exit()", output: "total" }] }).ok, false);
});

test("explicit numeric import preserves zero, logs conversions and refuses silent coercion", () => {
  const imported = [{ category: "First", amount: " 0 " }, { category: "Second", amount: "-1.5" }, { category: "Third", amount: 2 }];
  const original = structuredClone(imported);
  const document = { ...dataset, rows: [], chart: { ...dataset.chart, category: "category", value: "amount" }, operations: [{ op: "parse-number", field: "amount" }, { op: "formula", expression: "SUM(B1:B3)", output: "sheetTotal" }] };
  const run = executeData(document, { rows: imported });
  assert.equal(run.ok, true, run.error);
  assert.deepEqual(atPath(run.output, "rows"), [{ category: "First", amount: 0 }, { category: "Second", amount: -1.5 }, { category: "Third", amount: 2 }]);
  assert.equal(atPath(run.output, "summaries.sheetTotal"), 0.5);
  assert.deepEqual(atPath(run.output, "cleaningLog.0.changedRows"), [1, 2]);
  assert.deepEqual(imported, original);
  for (const amount of ["", " ", null, false, "NaN", "Infinity", "0x10", "1,000", "2e3", "1000000001", "1;process.exit()"])
    assert.equal(executeData(document, { rows: [{ category: "Invalid", amount }] }).ok, false, `Reject ${String(amount)} without inventing a measurement`);
});

const classifier = classifierDocumentSchema.parse({ training: [{ id: "train-low", features: [0], label: "low", group: "a" }, { id: "train-high", features: [10], label: "high", group: "b" }], test: [{ id: "practice", features: [1], label: "low", group: "a" }], k: 1, abstainBelow: 0.6, ruleThreshold: 5, modelVersion: "knn-v1", source: "Synthetic measurements", limitation: "Two examples cannot represent every future measurement.", humanReview: true });
test("ordered data cleaning preserves valid zero/false cells, original records and an actual change log", () => {
  const rows = [{ id: "one", category: " Fern ", amount: 0, enabled: false, irrelevant: "blue" }, { id: "two", category: "fern", amount: 3, enabled: true, irrelevant: "red" }, { id: "three", category: "   ", amount: 2, enabled: false, irrelevant: "gold" }, { id: "four", category: " MOSS ", amount: 7, enabled: true, irrelevant: "green" }];
  const original = structuredClone(rows);
  const document = dataDocumentSchema.parse({ dataSource: "fixture", question: "Which fictional plant categories were recorded?", rows: [], operations: [
    { op: "select", columns: ["id", "category", "amount", "enabled"] }, { op: "normalise", field: "category", trim: true, letterCase: "lower" }, { op: "require", field: "category" }, { op: "unique", field: "category" }, { op: "require", field: "amount" }, { op: "require", field: "enabled" },
  ], chart: { type: "none", title: "", category: "category", value: "amount", startAtZero: true }, conclusion: "This is a fictional sample.", source: "Original fictional records", licence: "original", credit: "", alternatives: "Table", fontSize: 18, representation: { mode: "none", values: [], text: "", bits: 8 } });
  const run = executeData(document, { rows });
  assert.equal(run.ok, true, run.error);
  assert.deepEqual(value(run.output).rows, [{ id: "one", category: "fern", amount: 0, enabled: false }, { id: "four", category: "moss", amount: 7, enabled: true }]);
  assert.deepEqual(rows, original);
  const log = value(run.output).cleaningLog as Array<Record<string, unknown>>;
  assert.deepEqual(log[1]!.changedRows, [1, 3, 4]); assert.deepEqual(log[2]!.removedRows, [3]); assert.deepEqual(log[3]!.removedRows, [2]);
  const wrongOrder = executeData({ ...document, operations: [document.operations[0]!, document.operations[3]!, document.operations[1]!, document.operations[2]!] }, { rows });
  assert.equal(value(wrongOrder.output).count, 3, "Deduplicating before normalising cannot identify the differently cased duplicate");
});
test("classifier predictions are learned from examples and held-out labels cannot be replaced by learner claims", () => {
  const heldOut = { test: [{ id: "unseen", features: [9], label: "high", group: "b" }] };
  const correct = executeClassifier(classifier, heldOut);
  assert.equal(value(correct.output).accuracy, 1);
  const wrong = executeClassifier({ ...classifier, training: classifier.training.map((example) => ({ ...example, label: "low" })) }, heldOut);
  assert.equal(value(wrong.output).accuracy, 0);
  assert.equal(value(executeClassifier({ ...classifier, training: [...classifier.training, heldOut.test[0]!] }, heldOut).output).disjoint, false);
});

test("media artifacts retain editable layers and enforce real layout, contrast and reuse checks", () => {
  const document = mediaDocumentSchema.parse({ name: "Delivery card", tool: "combined", caption: "Bring the parcel to the star", narration: "Follow the three arrows.", audience: "private", shapes: [{ id: "parcel", kind: "rectangle", x: 20, y: 30, width: 80, height: 60, fill: "#336699", text: "", alt: "A blue parcel" }], steps: ["Pick up the parcel", "Follow the arrows", "Stop at the star"], fontSize: 24, foreground: "#111111", background: "#ffffff", assets: [{ creator: "StarLiz learner", licence: "original", credit: "", alt: "Original parcel picture" }] });
  const run = executeMedia(document, { width: 320 });
  assert.equal(run.ok, true); assert.equal(value(run.output).accessible, true); assert.equal(value(run.output).privacySafe, true);
  assert.equal(value(executeMedia({ ...document, foreground: "#ffffff" }).output).accessible, false);
  assert.equal(value(executeMedia({ ...document, assets: [{ ...document.assets[0]!, licence: "restricted" }] }).output).permitted, false);
});
