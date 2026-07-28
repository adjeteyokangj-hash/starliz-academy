import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("parent support page uses locked complaint SLA wording", () => {
  const source = readFileSync(join(process.cwd(), "src/app/parent/support/page.tsx"), "utf8");
  assert.match(source, /2 working days/);
  assert.match(source, /10 working days/);
  assert.match(source, /1 working day/);
  assert.doesNotMatch(source, /1–2 business days/);
  assert.match(source, /safeguarding@starlizacademy\.com/);
  assert.match(source, /\/policies\/complaints/);
  assert.match(source, /\/safeguarding-policy/);
  assert.match(source, /not private one-to-one tutoring/i);
});

test("standalone wallet page is disabled", () => {
  const source = readFileSync(join(process.cwd(), "src/app/parent/wallet/page.tsx"), "utf8");
  assert.match(source, /Wallet unavailable/);
  assert.doesNotMatch(source, /getProfiles/);
});
