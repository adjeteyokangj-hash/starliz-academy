import test from "node:test";
import assert from "node:assert/strict";
import {
  checkChildUsernameAvailability,
  suggestAvailableChildUsernames,
  validateManualChildUsername,
} from "../src/lib/child-account-credentials";

test("manual username validation rejects email and short names", () => {
  assert.equal(validateManualChildUsername("kid@example.com").ok, false);
  assert.equal(validateManualChildUsername("ab").ok, false);
  assert.equal(validateManualChildUsername("adjei").ok, true);
});

test("suggestAvailableChildUsernames skips taken names", async () => {
  const taken = new Set(["adjei", "adjei1", "adjei2"]);
  const suggestions = await suggestAvailableChildUsernames({
    desired: "adjei",
    childName: "Adjei",
    count: 3,
    isTaken: async (username) => taken.has(username),
  });
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions.includes("adjei"), false);
  assert.equal(suggestions.includes("adjei1"), false);
  assert.equal(suggestions.every((s) => !taken.has(s)), true);
});

test("checkChildUsernameAvailability reports available and taken", async () => {
  const taken = new Set(["busykid"]);
  const free = await checkChildUsernameAvailability({
    username: "newkid",
    childName: "New Kid",
    isTaken: async (username) => taken.has(username),
  });
  assert.equal(free.available, true);
  assert.equal(free.valid, true);

  const busy = await checkChildUsernameAvailability({
    username: "busykid",
    childName: "Busy Kid",
    isTaken: async (username) => taken.has(username),
  });
  assert.equal(busy.available, false);
  assert.equal(busy.valid, true);
  assert.ok(busy.suggestions.length >= 1);
  assert.equal(busy.suggestions.includes("busykid"), false);
});