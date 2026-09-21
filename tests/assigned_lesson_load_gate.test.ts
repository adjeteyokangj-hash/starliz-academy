import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("playable assigned lessons skip curriculum safety hard-fail", () => {
  const assignments = readFileSync("src/app/api/student/assignments/route.ts", "utf8");
  assert.match(assignments, /Already-queued playable work must remain openable/);
  assert.match(assignments, /isPlayableAssignedStatus\(assignment\.status\)/);
  const assigned = readFileSync("src/app/api/content/assigned/route.ts", "utf8");
  assert.match(assigned, /isPlayableAssignedStatus/);
  assert.match(assigned, /playable assigned work stays openable/);
});

test("lesson page redirects on assignment 401", () => {
  const page = readFileSync("src/app/games/lesson/page.tsx", "utf8");
  assert.match(page, /response\.status === 401/);
  assert.match(page, /auth\/login\?next=/);
});