import test from "node:test";
import assert from "node:assert/strict";
import { dataDocumentSchema, executeData } from "../src/lib/coding/learning/studio-engines";
const base = dataDocumentSchema.parse({ dataSource: "fixture", question: "How are values represented?", rows: [], operations: [], chart: { type: "bar", title: "Sample values", category: "name", value: "value", startAtZero: true }, conclusion: "Compare actual values.", source: "Synthetic data", licence: "original", credit: "", alternatives: "All numeric values remain readable.", fontSize: 20, representation: { mode: "none", values: [], text: "", bits: 8 } });
function run(representation: Partial<typeof base.representation>) {
  const execution = executeData({ ...base, representation: { ...base.representation, ...representation } }, { rows: [] });
  assert.equal(execution.ok, true, execution.error);
  return execution.output as Record<string, unknown>;
}
test("UTF-8 encoding and decoding use actual bytes without silently truncating oversized values", () => {
  const output = run({ mode: "text", text: "é", values: [195, 169] });
  assert.deepEqual(output.encoded, [195, 169]); assert.equal(output.decoded, "é"); assert.equal(output.encodedBits, 16);
  assert.equal(executeData({ ...base, representation: { ...base.representation, mode: "text", values: [511] } }, { rows: [] }).ok, false);
  assert.equal(executeData({ ...base, representation: { ...base.representation, mode: "text", bits: 7 } }, { rows: [] }).ok, false);
});
test("pixel quantisation and audio payload calculations reflect actual sample counts and bit depths", () => {
  const pixels = run({ mode: "pixels", values: [0, 85, 170, 255], bits: 2, width: 2 });
  assert.deepEqual(pixels.quantised, [0, 1, 2, 3]); assert.equal(pixels.representationBits, 8); assert.equal(pixels.representationWidth, 2);
  const sound = run({ mode: "sound", values: [0, 255], bits: 4, sampleRate: 2000 });
  assert.equal(sound.durationSeconds, 0.001); assert.equal(sound.bitRate, 8000); assert.equal(sound.representationBits, 8);
});
test("privacy checks include the supplied dataset, not only the learner's unused table", () => {
  const execution = executeData(base, { rows: [{ email: "fictional-person@example.com" }] });
  assert.equal((execution.output as Record<string, unknown>).privacySafe, false);
});
