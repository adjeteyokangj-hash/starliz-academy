import test from "node:test";
import assert from "node:assert/strict";
import { transform } from "esbuild";
import { inventoryDomProgram } from "../src/lib/coding/learning/dom-service-runtime";
import { domServiceFixtureSchema, inventorySnapshotSchema } from "../src/lib/coding/learning/dom-service-contract";
import { executeSource, ExecutionUnavailable } from "../src/lib/coding/learning/source-execution";
import type { executeCodingSource } from "../src/lib/coding/execution/client";

const service = { kind: "inventory-v1", items: [{ id: "paper", title: "Fictional paper", quantity: 0, revision: 0 }] };
test("local service configuration accepts only bounded data, never arbitrary handlers, paths or authority", () => {
  assert.equal(domServiceFixtureSchema.safeParse(service).success, true);
  for (const changed of [{ ...service, role: "administrator" }, { ...service, handlerSource: "UNTRUSTED" }, { ...service, items: [{ ...service.items[0], id: "../outside" }] }, { ...service, items: [{ ...service.items[0], quantity: -1 }] }, { ...service, items: [service.items[0], service.items[0]] }]) assert.equal(domServiceFixtureSchema.safeParse(changed).success, false);
  assert.equal(inventorySnapshotSchema.safeParse({ schema: "unknown", items: service.items }).success, false);
  assert.equal(inventorySnapshotSchema.safeParse({ schema: "starliz-inventory-v1", items: service.items, credentials: "FORBIDDEN" }).success, false);
});
test("the generated container program parses without executing learner strings on the host", async () => {
  const source = "// SUPPLIED_SERVICE remains learner text\ndocument.body.textContent = '</script> Fictional';";
  const generated = inventoryDomProgram(source, "<html><body></body></html>", "body{color:#111}", domServiceFixtureSchema.parse(service), []);
  await transform(generated, { loader: "js", target: "node22", logLevel: "silent" });
  assert.ok(generated.includes(JSON.stringify(source))); assert.ok(generated.includes("DatabaseSync"));
});
test("a supplied service cannot produce passing execution without matching actual snapshot evidence", async () => {
  let calls = 0;
  const transport: typeof executeCodingSource = async input => { calls++; return { jobId: "unit-contract-only", language: input.language, status: "completed", stdout: '__STARLIZ_RESULT__{"result":{"html":"<html><body>Unverified</body></html>"},"files":{}}\n', stderr: "", exitCode: 0, durationMs: 1, imageDigest: `sha256:${"a".repeat(64)}`, isolationRuntime: "runsc" }; };
  await assert.rejects(() => executeSource({ type: "source", language: "javascript", entry: "dom", html: "<main>Private fixture</main>", source: "document.body.textContent='Unverified';" }, { fixtureService: service }, transport), ExecutionUnavailable);
  assert.equal(calls, 1, "Missing service verification is refused before any false successful DOM inspection");
});
