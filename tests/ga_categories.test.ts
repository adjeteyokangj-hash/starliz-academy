import test from "node:test";
import assert from "node:assert/strict";
import { resolveGaCategoryAgainstAllowed } from "../src/lib/ga-categories";

test("category resolver accepts case-insensitive matches against allow-list", () => {
  assert.equal(resolveGaCategoryAgainstAllowed("money terms", ["Money Terms", "Greetings"]), "Money Terms");
  assert.equal(resolveGaCategoryAgainstAllowed("greetings", ["Money Terms", "Greetings"]), "Greetings");
});

test("category resolver keeps alias normalization while enforcing allow-list", () => {
  assert.equal(resolveGaCategoryAgainstAllowed("transportation", ["Transport"]), "Transport");
  assert.throws(() => resolveGaCategoryAgainstAllowed("transportation", ["Numbers"]), /Category must be one of/);
});
