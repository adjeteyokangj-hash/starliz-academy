import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSupabaseExecutionGateway } from "../services/coding-runner/supabase-gateway.mjs";
import { requestProof, sign } from "../services/coding-runner/protocol.mjs";

const secret = "gateway-test-secret-never-use-in-production";
function request(body = "{}", signature = true) {
  const timestamp = Date.now().toString(), nonce = randomUUID();
  return new Request("https://project.supabase.co/functions/v1/coding-execution/execute", {
    method: "POST", body, headers: { "X-Coding-Timestamp": timestamp, "X-Coding-Nonce": nonce,
      "X-Coding-Signature": signature ? sign(secret, requestProof("POST", "/execute", timestamp, nonce, body)) : "invalid",
      Authorization: "Bearer must-not-forward", Cookie: "must-not-forward" },
  });
}
test("Supabase gateway preserves signed bytes and strips browser/database authority", async () => {
  const handler = createSupabaseExecutionGateway({ runnerUrl: "https://isolated.example", secret,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://isolated.example/execute");
      assert.equal(options.body, '{"source":"print(12)"}');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.redirect, "error");
      return new Response('{"stdout":"12"}', { headers: { "X-Coding-Signature": "signed-result" } });
    } });
  const result = await handler(request('{"source":"print(12)"}'));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("x-coding-signature"), "signed-result");
  assert.equal(await result.text(), '{"stdout":"12"}');
});
test("Supabase gateway rejects unauthenticated and oversized requests before forwarding", async () => {
  let calls = 0;
  const handler = createSupabaseExecutionGateway({ runnerUrl: "https://isolated.example", secret,
    fetchImpl: async () => { calls++; throw new Error("Unexpected upstream call"); } });
  assert.equal((await handler(request("{}", false))).status, 401);
  assert.equal((await handler(request("x".repeat(100000)))).status, 413);
  assert.equal(calls, 0);
});
test("Supabase gateway fails closed on upstream outage and insecure configuration", async () => {
  assert.throws(() => createSupabaseExecutionGateway({ runnerUrl: "http://isolated.example", secret }));
  const handler = createSupabaseExecutionGateway({ runnerUrl: "https://isolated.example", secret,
    fetchImpl: async () => { throw new Error("private infrastructure detail"); } });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /private infrastructure/);
});
