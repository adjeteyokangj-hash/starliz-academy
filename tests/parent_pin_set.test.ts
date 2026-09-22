import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("pin set/verify routes are retired and do not issue unlock cookies", () => {
  assert.match(read("src/app/api/pin/set/route.ts"), /parent-pin-retired/);
  assert.match(read("src/app/api/pin/verify/route.ts"), /parent-pin-retired/);
  assert.doesNotMatch(read("src/app/api/pin/set/route.ts"), /createParentUnlockToken/);
  assert.doesNotMatch(read("src/app/api/pin/verify/route.ts"), /createParentUnlockToken/);
});
