import test from "node:test";
import assert from "node:assert/strict";
import { jsonValue, practicalArtifactSchema } from "../src/lib/coding/learning/types";
import { readActivityBody } from "../src/lib/coding/learning/request";

test("workspace validation rejects deeply nested, cyclic and prototype-shaped data before recursive validation", () => {
  let nested: unknown = "leaf";
  for (let index = 0; index < 10000; index++) nested = [nested];
  assert.equal(jsonValue.safeParse(nested).success, false);
  const cycle: unknown[] = []; cycle.push(cycle);
  assert.equal(jsonValue.safeParse(cycle).success, false);
  const shared = { caption: "A real saved card" };
  assert.equal(jsonValue.safeParse({ document: shared, preview: shared }).success, true, "Shared JSON-compatible values are aliases, not ancestor cycles");
  assert.equal(jsonValue.safeParse(JSON.parse('{"__proto__":{"trusted":true}}')).success, false);
  assert.equal(practicalArtifactSchema.safeParse({ type: "visual", document: { handlers: { start: [] }, variables: {} } }).success, true);
});

test("streamed activity bodies enforce their byte limit even without Content-Length", async () => {
  const chunks = [new Uint8Array(100000).fill(32), new Uint8Array(100000).fill(32)];
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); }, cancel() { cancelled = true; } });
  const request = { headers: new Headers(), body } as Request;
  await assert.rejects(() => readActivityBody(request), /too large/);
  assert.equal(cancelled, true);
});

test("activity body decoding preserves split UTF-8 characters and rejects malformed requests", async () => {
  const bytes = new TextEncoder().encode('{"explanation":"雪"}');
  const body = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 17)); controller.enqueue(bytes.slice(17, 18)); controller.enqueue(bytes.slice(18)); controller.close(); } });
  assert.deepEqual(await readActivityBody({ headers: new Headers(), body } as Request), { explanation: "雪" });
  await assert.rejects(() => readActivityBody(new Request("https://coding.invalid", { method: "POST", body: "{" })), /valid UTF-8/);
  await assert.rejects(() => readActivityBody(new Request("https://coding.invalid", { method: "POST", body: "{}", headers: { "content-length": "300000" } })), /too large/);
});
test("a stalled upload cannot hold the request open even when its underlying cancellation never settles", async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  await assert.rejects(() => readActivityBody({ headers: new Headers(), body } as Request, 25), (error: unknown) => error instanceof Error && "status" in error && error.status === 408);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
