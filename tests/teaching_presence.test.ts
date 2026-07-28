import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCHOOL_OPS_LIMITATIONS } from "../src/lib/schools/school-ops-overview";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("teaching presence helper filters Day School linked heartbeats", () => {
  const src = read("src/lib/schools/teaching-presence.ts");
  assert.match(src, /countLiveTeachingHeartbeats/);
  assert.match(src, /getOrCreateSupportPolicy/);
  assert.match(src, /dayLessonId/);
  assert.match(src, /available.*busy|busy.*available/);
  assert.match(src, /staleAfterSec/);
});

test("ops overview exposes liveTeachingHeartbeats and updated limitation", () => {
  const ops = read("src/lib/schools/school-ops-overview.ts");
  assert.match(ops, /liveTeachingHeartbeats/);
  assert.match(ops, /countLiveTeachingHeartbeats/);
  assert.match(SCHOOL_OPS_LIMITATIONS.join(" "), /TutorPresence|heartbeat/i);
  assert.doesNotMatch(
    SCHOOL_OPS_LIMITATIONS.join(" "),
    /not a live presence clock/,
  );
});

test("ops dashboard shows live heartbeats sublabel", () => {
  const client = read("src/components/school-admin/SchoolOpsDashboardClient.tsx");
  assert.match(client, /Live heartbeats/);
  assert.match(client, /liveTeachingHeartbeats/);
  assert.doesNotMatch(client, /\/admin\//);
});