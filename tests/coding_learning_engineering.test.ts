import test from "node:test";
import assert from "node:assert/strict";
import { engineeringDocumentSchema } from "../src/lib/coding/learning/engineering-contract";
import { executeEngineering } from "../src/lib/coding/learning/engineering-engine";
import type { Json } from "../src/lib/coding/learning/types";

const originalFiles = { "guide.txt": "A fictional team guide." };
const versions = [{ id: "v1", author: "Fictional owner", files: originalFiles }];
const document = engineeringDocumentSchema.parse({ purpose: "Improve a fictional team guide", audience: "Private practice team", language: "javascript", files: { "guide.txt": "Attempted direct replacement" }, versions: [], selectedVersion: "v1", actions: [{ op: "edit", target: "guide.txt", content: "A clearer fictional team guide.", author: "Fictional editor" }, { op: "snapshot", target: "v2", content: "", author: "Fictional editor" }], tasks: [], permissions: { editors: ["owner", "editor"], viewers: ["owner", "editor", "viewer"] }, tests: [], run: false, entryFile: "guide.txt", notes: "Only fictional contributor labels are used.", sources: [], handover: { setup: "", test: "", rollback: "", limitation: "", nextLearning: "" } });
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};

test("authoritative initial files and role prevent a viewer's edit or base-file replacement", async () => {
  const fixture = { initialFiles: originalFiles, initialVersions: versions, role: "viewer", claimedRole: "owner" };
  const run = await executeEngineering(document, fixture);
  assert.equal(run.ok, true, run.error); const output = record(run.output);
  assert.equal(output.canEdit, false); assert.equal(output.canView, true); assert.equal(output.denied, 2);
  assert.deepEqual(output.files, originalFiles); assert.equal(output.historyCount, 1);
  assert.deepEqual(fixture.initialFiles, originalFiles);
});

test("an authorised editor's actual change is attributed and prior version content remains intact", async () => {
  const run = await executeEngineering(document, { initialFiles: originalFiles, initialVersions: versions, role: "editor" });
  assert.equal(run.ok, true, run.error); const output = record(run.output), history = output.history as Json[];
  assert.equal(output.changes, 1); assert.equal(output.historyCount, 2); assert.equal(output.originalPreserved, true);
  assert.deepEqual(record(history[0]).files, originalFiles);
  assert.equal(record(history[1]).author, "Fictional editor");
  assert.equal(record(output.files)["guide.txt"], "A clearer fictional team guide.");
});

test("edit permission cannot bypass missing view access and a chosen label cannot impersonate restoration", async () => {
  const inaccessible = await executeEngineering({ ...document, permissions: { editors: ["anonymous"], viewers: ["owner"] } }, { initialFiles: originalFiles, initialVersions: versions, role: "anonymous" });
  assert.equal(record(inaccessible.output).canEdit, false); assert.deepEqual(record(inaccessible.output).files, {}); assert.deepEqual(record(inaccessible.output).history, []);
  const labelOnly = await executeEngineering({ ...document, actions: [] }, { initialFiles: originalFiles, initialVersions: versions });
  assert.equal(record(labelOnly.output).restoredCorrectVersion, false);
  const restored = await executeEngineering({ ...document, actions: [{ op: "restore", target: "v1", content: "", author: "Fictional owner" }] }, { initialFiles: originalFiles, initialVersions: versions });
  assert.equal(record(restored.output).restoredCorrectVersion, true);
});

test("an applied edit cannot exceed the project file limits or alter the caller's baseline", async () => {
  const files = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`file${index}.txt`, "Fictional note"]));
  const run = await executeEngineering({ ...document, files, versions: [], actions: [{ op: "edit", target: "tenth.txt", content: "Extra note", author: "Fictional owner" }] }, {});
  assert.equal(run.ok, false); assert.equal(Object.keys(files).length, 9); assert.equal(Object.hasOwn(files, "tenth.txt"), false);
});
