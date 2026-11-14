import test from "node:test";
import assert from "node:assert/strict";
import { executeNetwork, networkDocumentSchema } from "../src/lib/coding/learning/studio-engines";
import { atPath } from "../src/lib/coding/learning/checks";

const model = networkDocumentSchema.parse({ nodes: ["client", "router", "service"], links: [["client", "router"], ["router", "service"]], from: "client", to: "service", service: "message", query: "A query is not a replacement payload", index: [], relevanceWeight: 1, promotionWeight: 0, selected: [], evidence: "Offline shared-route model", concern: "none", packets: [], expectedPackets: 3 });
test("incomplete or duplicated packets cannot fabricate a successful service payload", () => {
  for (const service of ["message", "file", "email", "web"]) {
    const result = executeNetwork({ ...model, service }, { packets: [{ sequence: 0, text: "A" }, { sequence: 1, text: "B" }] });
    assert.equal(result.ok, true); assert.equal(atPath(result.output, "connected"), true);
    assert.equal(atPath(result.output, "reconstructed"), null); assert.equal(atPath(result.output, "serviceResult"), null);
    assert.deepEqual(atPath(result.output, "missingSequences"), [2]);
  }
  const duplicate = executeNetwork(model, { packets: [{ sequence: 1, text: "B" }, { sequence: 0, text: "A" }, { sequence: 1, text: "B" }] });
  assert.deepEqual(atPath(duplicate.output, "duplicateSequences"), [1]);
  assert.deepEqual(atPath(duplicate.output, "packetOrder"), [0, 1, 1]);
  assert.equal(atPath(duplicate.output, "serviceResult"), null);
});
test("actual ordered reconstruction preserves empty payloads and ordinary query services", () => {
  const delivered = executeNetwork(model, { packets: [{ sequence: 2, text: "C" }, { sequence: 0, text: "A" }, { sequence: 1, text: "B" }] });
  assert.equal(atPath(delivered.output, "reconstructed"), "ABC"); assert.equal(atPath(delivered.output, "serviceResult.text"), "ABC");
  const empty = executeNetwork({ ...model, expectedPackets: 1 }, { packets: [{ sequence: 0, text: "" }] });
  assert.equal(atPath(empty.output, "serviceResult.text"), "", "A valid empty packet message must not turn into the query text");
  const query = executeNetwork({ ...model, expectedPackets: 0 }, {});
  assert.equal(atPath(query.output, "serviceResult.text"), model.query);
  const disconnected = executeNetwork({ ...model, links: [] }, { packets: [{ sequence: 0, text: "A" }, { sequence: 1, text: "B" }, { sequence: 2, text: "C" }] });
  assert.equal(atPath(disconnected.output, "connected"), false); assert.equal(atPath(disconnected.output, "serviceResult"), null);
});
