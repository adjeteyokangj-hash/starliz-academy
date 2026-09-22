import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routePath = join(process.cwd(), "src/app/api/student/improving-session/route.ts");
const dashboardPath = join(process.cwd(), "src/app/student/dashboard/page.tsx");

test("improving-session API is POST-only and requires a session", () => {
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /export async function POST\(/);
  assert.doesNotMatch(source, /export async function GET\(/);
  assert.match(source, /requireSession/);
  assert.match(source, /if \(!session\) return response/);
});

test("improving-session API resolves student-owned profile and blocks cross-student starts", () => {
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /resolveStudentOwnedChildProfile/);
  assert.match(source, /role === "student"/);
  assert.match(source, /Student can only start their own improving session/);
  assert.match(source, /resolveParentScope/);
  assert.match(source, /ensureLearningAccess/);
});

test("improving-session API returns boost href contract and no-data codes", () => {
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /resolveImprovingBoostSession/);
  assert.match(source, /improvingSessionHref/);
  assert.match(source, /ok: true/);
  assert.match(source, /assignmentId: sessionPlan\.assignment\.id/);
  assert.match(source, /href: sessionPlan\.href/);
  assert.match(source, /NO_MATCHING_CONTENT/);
  assert.match(source, /NO_IMPROVING_SKILLS/);
  assert.match(source, /status: 409/);
});

test("student dashboard POSTs improving-session and navigates to payload.href", () => {
  const source = readFileSync(dashboardPath, "utf8");
  assert.match(source, /\/api\/student\/improving-session/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /payload\?\.href/);
  assert.match(source, /router\.push\(payload\.href\)/);
});