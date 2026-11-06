import test from "node:test";
import assert from "node:assert/strict";
import { evidenceDocumentSchema, executeEvidence } from "../src/lib/coding/learning/evidence-engine";
import { executePractical } from "../src/lib/coding/learning/runtime";
import { visual } from "../src/lib/coding/learning/authoring";
import type { Json } from "../src/lib/coding/learning/types";

const rows = [{ choice: "tree" }, { choice: "boat" }, { choice: "tree" }];
const original = { name: "Original evidence card", tool: "combined", caption: "Fictional picture choices", narration: "An original green circle and an acknowledged provided square.", audience: "private", shapes: [{ id: "original-circle", kind: "circle", x: 20, y: 50, width: 80, height: 80, fill: "#166534", text: "", alt: "Original green circle" }], steps: [], fontSize: 24, foreground: "#0f172a", background: "#ffffff", assets: [] };
const source = { id: "square", title: "Provided square", creator: "StarLiz Studio", licence: "CC-BY", shapes: [{ id: "square", kind: "rectangle", x: 450, y: 50, width: 80, height: 80, fill: "#b45309", text: "", alt: "Provided brown square" }] };
const document = evidenceDocumentSchema.parse({ data: { dataSource: "fixture", rows: [], question: "Which picture?", operations: [{ op: "group", field: "choice" }], chart: { type: "bar", title: "Fictional choices", category: "category", value: "count", startAtZero: true }, conclusion: "This fictional group chose tree most often.", source: "Synthetic observations", licence: "original", credit: "", alternatives: "Category names and counts are shown in the table.", fontSize: 24, representation: { mode: "none", values: [], text: "", bits: 8 } }, picture: { media: original, files: [], actions: [{ op: "save", name: "Original evidence card" }] }, assetId: "square", assetCredit: "StarLiz Studio", controls: [{ id: "explain", label: "Explain the largest group", element: "button", action: "describe-largest" }, { id: "table", label: "Show the table", element: "button", action: "show-table" }] });
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};

test("the poster composes actual data, editable artwork, source permission and interactive explanation", async () => {
  const run = await executePractical("evidence", visual(document), { data: { rows }, assets: [source], events: [{ type: "click", target: "explain" }] });
  assert.equal(run.ok, true, run.error); const output = record(run.output);
  assert.equal(output.originalRetained, true);
  assert.equal(record(output.reuse).permitted, true); assert.equal(record(output.reuse).credited, true);
  assert.equal(output.controlsAccessible, true);
  assert.equal((record(output.document).shapes as Json[]).length, 2, "The actual provided picture is composed with the editable original layer");
  assert.match(String(record(output.interaction).explanation), /tree.*2/);
  const changed = executeEvidence(document, { data: { rows: [{ choice: "boat" }, { choice: "boat" }, { choice: "tree" }] }, assets: [source], events: [{ type: "click", target: "explain" }] });
  assert.equal(changed.ok, true, changed.error); assert.match(String(record(record(changed.output).interaction).explanation), /boat.*2/);
  const table = executeEvidence(document, { data: { rows }, assets: [source], events: [{ type: "click", target: "table" }] });
  assert.equal(record(record(table.output).interaction).view, "table");
});

test("poster permission comes from the supplied asset and the entered credit, not a learner licence claim", () => {
  const uncredited = executeEvidence({ ...document, assetCredit: "Another creator" }, { data: { rows }, assets: [source] });
  assert.equal(record(record(uncredited.output).reuse).permitted, false);
  const restricted = executeEvidence(document, { data: { rows }, assets: [{ ...source, licence: "restricted" }] });
  assert.equal(record(record(restricted.output).reuse).permitted, false);
  const unknown = executeEvidence({ ...document, assetId: "not-supplied" }, { data: { rows }, assets: [source] });
  assert.equal(unknown.ok, false); assert.match(unknown.error!, /supplied/);
  const noSavedOriginal = executeEvidence({ ...document, picture: { ...document.picture, actions: [] } }, { data: { rows }, assets: [source] });
  assert.equal(record(noSavedOriginal.output).originalRetained, false, "Preservation is never inferred merely from having an editable picture");
});

test("poster controls expose actual Tab-order semantics and reject undeclared or disabled actions", () => {
  const skipped = executeEvidence({ ...document, controls: document.controls.map((control) => ({ ...control, element: "skip-tab" })) }, { data: { rows }, assets: [source] });
  assert.equal(record(skipped.output).controlsAccessible, false);
  assert.equal(executeEvidence(document, { data: { rows }, assets: [source], events: [{ target: "unknown", type: "click" }] }).ok, false);
  const disabled = { ...document, controls: document.controls.map((control) => ({ ...control, disabled: true })) };
  assert.equal(executeEvidence(disabled, { data: { rows }, assets: [source], events: [{ target: "explain", type: "click" }] }).ok, false);
});
